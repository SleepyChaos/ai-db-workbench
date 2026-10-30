use std::{convert::Infallible, path::PathBuf, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, State},
    http::{HeaderMap, StatusCode},
    response::{
        IntoResponse, Response, Sse,
        sse::{Event, KeepAlive},
    },
    routing::{get, post},
};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::{
    fs,
    sync::{Semaphore, mpsc},
};
use tokio_stream::wrappers::ReceiverStream;
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    client: reqwest::Client,
    agent_url: String,
    token: String,
    data_dir: PathBuf,
    run_slot: Arc<Semaphore>,
}

#[derive(Debug)]
struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error": self.1}))).into_response()
    }
}

fn internal_error(_: impl std::fmt::Display) -> ApiError {
    ApiError(
        StatusCode::INTERNAL_SERVER_ERROR,
        "无法读写会话记录，请检查应用数据卷。".into(),
    )
}

#[derive(Default, Serialize, Deserialize)]
struct Session {
    #[serde(default)]
    messages: Vec<Value>,
    #[serde(default)]
    agent_messages: Vec<Value>,
}

#[derive(Deserialize)]
struct ChatInput {
    session_id: Uuid,
    message: String,
}

fn catalogue() -> Value {
    json!({"databases": [
        {"id":"mysql", "name":"MySQL", "kind":"关系型"},
        {"id":"mongodb", "name":"MongoDB", "kind":"文档"},
        {"id":"redis", "name":"Redis", "kind":"键值 / 数据结构"},
        {"id":"cassandra", "name":"Cassandra", "kind":"宽列"},
        {"id":"neo4j", "name":"Neo4j", "kind":"图"},
        {"id":"influxdb", "name":"InfluxDB", "kind":"时序"},
        {"id":"elasticsearch", "name":"Elasticsearch", "kind":"搜索"},
        {"id":"clickhouse", "name":"ClickHouse", "kind":"分析"},
        {"id":"milvus", "name":"Milvus", "kind":"向量"}
    ], "adapter_status":"planned", "connections":[],
        "can_query":false, "can_write":false,
        "note":"当前为项目骨架，数据库适配器尚未实现，没有已连接的数据源。"})
}

async fn health() -> Json<Value> {
    Json(json!({"status":"ok", "service":"rust-api"}))
}

async fn status(State(state): State<AppState>) -> Json<Value> {
    let agent = match state
        .client
        .get(format!("{}/health", state.agent_url))
        .timeout(Duration::from_secs(4))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => response
            .json::<Value>()
            .await
            .unwrap_or(json!({"status":"unavailable", "configured":false})),
        _ => json!({"status":"unavailable", "configured":false}),
    };
    Json(json!({"backend":"ok", "agent":agent, "database_adapters":"planned"}))
}

async fn databases() -> Json<Value> {
    Json(catalogue())
}

fn authorize(headers: &HeaderMap, token: &str) -> Result<(), ApiError> {
    let expected = format!("Bearer {token}");
    if headers.get("authorization").and_then(|h| h.to_str().ok()) != Some(expected.as_str()) {
        return Err(ApiError(
            StatusCode::UNAUTHORIZED,
            "内部工具认证失败。".into(),
        ));
    }
    Ok(())
}

async fn capabilities(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize(&headers, &state.token)?;
    Ok(Json(catalogue()))
}

async fn read_session(state: &AppState, id: Uuid) -> Result<Session, ApiError> {
    let path = state.data_dir.join(format!("{id}.json"));
    match fs::read(path).await {
        Ok(data) => serde_json::from_slice(&data).map_err(internal_error),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Session::default()),
        Err(e) => Err(internal_error(e)),
    }
}

async fn session(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let stored = read_session(&state, id).await?;
    Ok(Json(json!({"session_id":id, "messages":stored.messages})))
}

async fn save_session(state: &AppState, id: Uuid, session: &Session) -> Result<(), ApiError> {
    let encoded = serde_json::to_vec(session).map_err(internal_error)?;
    if encoded.len() > 4 * 1024 * 1024 {
        return Err(ApiError(
            StatusCode::PAYLOAD_TOO_LARGE,
            "会话过长，请新建对话。".into(),
        ));
    }
    let temporary = state.data_dir.join(format!("{id}.tmp"));
    fs::write(&temporary, encoded)
        .await
        .map_err(internal_error)?;
    fs::rename(temporary, state.data_dir.join(format!("{id}.json")))
        .await
        .map_err(internal_error)
}

fn check_origin(headers: &HeaderMap) -> Result<(), ApiError> {
    if let Some(origin) = headers.get("origin") {
        let origin = origin
            .to_str()
            .ok()
            .and_then(|s| reqwest::Url::parse(s).ok());
        let host = headers.get("host").and_then(|h| h.to_str().ok());
        let valid = origin.as_ref().is_some_and(|url| {
            let authority = &url[url::Position::BeforeHost..url::Position::AfterPort];
            matches!(url.scheme(), "http" | "https") && Some(authority) == host
        });
        if !valid {
            return Err(ApiError(
                StatusCode::FORBIDDEN,
                "不接受跨站对话请求。".into(),
            ));
        }
    }
    Ok(())
}

async fn chat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ChatInput>,
) -> Result<Response, ApiError> {
    check_origin(&headers)?;
    let message = input.message.trim().to_owned();
    if message.is_empty() || message.chars().count() > 12_000 {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "请输入 1–12000 个字符。".into(),
        ));
    }
    let permit = state.run_slot.clone().try_acquire_owned().map_err(|_| {
        ApiError(
            StatusCode::CONFLICT,
            "已有对话正在运行，请等待完成或停止。".into(),
        )
    })?;
    let mut stored = read_session(&state, input.session_id).await?;
    let run_id = Uuid::new_v4();
    let response = state
        .client
        .post(format!("{}/chat", state.agent_url))
        .bearer_auth(&state.token)
        .json(&json!({"run_id":run_id, "session_id":input.session_id,
            "message":message, "history":stored.agent_messages}))
        .send()
        .await
        .map_err(|_| ApiError(StatusCode::BAD_GATEWAY, "Pi 服务暂时不可用。".into()))?;
    if !response.status().is_success() {
        let upstream_status = response.status();
        let error = response
            .json::<Value>()
            .await
            .ok()
            .and_then(|v| v["error"].as_str().map(str::to_owned))
            .unwrap_or_else(|| "Pi 请求失败。".into());
        let code = if upstream_status == StatusCode::SERVICE_UNAVAILABLE {
            StatusCode::SERVICE_UNAVAILABLE
        } else {
            StatusCode::BAD_GATEWAY
        };
        return Err(ApiError(code, error));
    }
    let (sender, receiver) = mpsc::channel::<Result<Event, Infallible>>(32);
    tokio::spawn(async move {
        let _permit = permit;
        let mut stream = response.bytes_stream();
        let mut buffer = Vec::new();
        let mut finished = false;
        'read: loop {
            let next = tokio::select! {
                _ = sender.closed() => break,
                item = stream.next() => item,
            };
            match next {
                Some(Ok(bytes)) => buffer.extend_from_slice(&bytes),
                Some(Err(_)) => {
                    send(
                        &sender,
                        json!({"type":"error", "message":"Pi 事件流中断或超时，本轮未保存。"}),
                    )
                    .await;
                    break;
                }
                None => break,
            }
            if buffer.len() > 4 * 1024 * 1024 {
                send(
                    &sender,
                    json!({"type":"error", "message":"Pi 响应过大，请新建对话。"}),
                )
                .await;
                break;
            }
            while let Some(end) = buffer.iter().position(|b| *b == b'\n') {
                let line: Vec<u8> = buffer.drain(..=end).collect();
                let Ok(mut event) = serde_json::from_slice::<Value>(&line) else {
                    send(
                        &sender,
                        json!({"type":"error", "message":"Pi 返回了无效的事件。"}),
                    )
                    .await;
                    break 'read;
                };
                match event["type"].as_str() {
                    Some("done") => {
                        let Some(history) = event["history"].as_array() else {
                            break 'read;
                        };
                        let Some(text) = event["text"].as_str() else {
                            break 'read;
                        };
                        stored.agent_messages = history.clone();
                        stored
                            .messages
                            .push(json!({"role":"user", "content":message}));
                        stored
                            .messages
                            .push(json!({"role":"assistant", "content":text}));
                        if let Err(e) = save_session(&state, input.session_id, &stored).await {
                            send(&sender, json!({"type":"error", "message":e.1})).await;
                        } else {
                            send(&sender, json!({"type":"done", "run_id":run_id})).await;
                        }
                        finished = true;
                        break 'read;
                    }
                    Some("error") => {
                        finished = true;
                    }
                    Some("delta" | "tool_start" | "tool_end" | "start") => {}
                    _ => continue,
                }
                event["run_id"] = json!(run_id);
                if !send(&sender, event).await || finished {
                    break 'read;
                }
            }
        }
        if !finished && !sender.is_closed() {
            send(
                &sender,
                json!({"type":"error", "message":"本轮对话未完成，未写入历史记录。"}),
            )
            .await;
        }
    });
    Ok(Sse::new(ReceiverStream::new(receiver))
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(10)))
        .into_response())
}

async fn send(sender: &mpsc::Sender<Result<Event, Infallible>>, value: Value) -> bool {
    sender
        .send(Ok(Event::default().data(value.to_string())))
        .await
        .is_ok()
}

fn router(state: AppState, static_dir: &str) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/status", get(status))
        .route("/api/databases", get(databases))
        .route("/api/sessions/{id}", get(session))
        .route("/api/chat", post(chat))
        .route("/api/internal/capabilities", get(capabilities))
        .route(
            "/api/{*path}",
            get(|| async { (StatusCode::NOT_FOUND, Json(json!({"error":"接口不存在。"}))) }),
        )
        .fallback_service(
            ServeDir::new(static_dir)
                .not_found_service(ServeFile::new(format!("{static_dir}/index.html"))),
        )
        .layer(DefaultBodyLimit::max(64 * 1024))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()))
        .init();
    let data_dir =
        PathBuf::from(std::env::var("DATA_DIR").unwrap_or_else(|_| "./local-data/sessions".into()));
    let token_file = PathBuf::from(
        std::env::var("INTERNAL_TOKEN_FILE")
            .unwrap_or_else(|_| "./local-data/internal-token".into()),
    );
    fs::create_dir_all(&data_dir).await?;
    if let Some(parent) = token_file.parent() {
        fs::create_dir_all(parent).await?;
    }
    let token = match fs::read_to_string(&token_file).await {
        Ok(token) => token,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let token = format!("{}{}", Uuid::new_v4(), Uuid::new_v4());
            fs::write(&token_file, &token).await?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&token_file, std::fs::Permissions::from_mode(0o600)).await?;
            }
            token
        }
        Err(e) => return Err(e.into()),
    };
    if token.trim().len() < 32 {
        return Err("Internal token is invalid".into());
    }
    let state = AppState {
        client: reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(150))
            .build()?,
        agent_url: std::env::var("AGENT_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:3001".into())
            .trim_end_matches('/')
            .into(),
        token,
        data_dir,
        run_slot: Arc::new(Semaphore::new(1)),
    };
    let addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".into());
    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "../web/dist".into());
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(%addr, "workbench ready");
    axum::serve(listener, router(state, &static_dir))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use tower::ServiceExt;

    fn test_state() -> AppState {
        AppState {
            client: reqwest::Client::new(),
            agent_url: "http://127.0.0.1:1".into(),
            token: "unit-test-internal-token".into(),
            data_dir: std::env::temp_dir().join(Uuid::new_v4().to_string()),
            run_slot: Arc::new(Semaphore::new(1)),
        }
    }

    #[tokio::test]
    async fn internal_tools_require_authentication() {
        let app = router(test_state(), "/nonexistent");
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/internal/capabilities")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/internal/capabilities")
                    .header("authorization", "Bearer unit-test-internal-token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn completed_sessions_survive_state_recreation() {
        let state = test_state();
        fs::create_dir_all(&state.data_dir).await.unwrap();
        let id = Uuid::new_v4();
        let session = Session {
            messages: vec![json!({"role":"user","content":"hello"})],
            agent_messages: vec![],
        };
        save_session(&state, id, &session).await.unwrap();
        assert_eq!(
            read_session(&state, id).await.unwrap().messages,
            session.messages
        );
        fs::remove_dir_all(&state.data_dir).await.unwrap();
    }

    #[test]
    fn rejects_cross_origin_requests() {
        let mut headers = HeaderMap::new();
        headers.insert("host", "localhost:8080".parse().unwrap());
        headers.insert("origin", "https://evil.example".parse().unwrap());
        assert!(check_origin(&headers).is_err());
        headers.insert("origin", "http://localhost:8080".parse().unwrap());
        assert!(check_origin(&headers).is_ok());
    }
}
