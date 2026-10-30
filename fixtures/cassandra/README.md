# Cassandra fixture

使用 GH Archive 的单小时 GitHub 事件 JSONL 压缩文件，按 `repo` 与事件日期建立分区，适合验证宽表、时间范围查询和分页。

```bash
python3 fixtures/fetch.py cassandra
gzip -dc fixtures/local/cassandra/github-events-2015-01-01-15.json.gz > fixtures/local/cassandra/events.json
```

来源：[GH Archive](https://www.gharchive.org/)。
