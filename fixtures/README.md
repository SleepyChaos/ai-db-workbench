# 本地数据库测试数据

测试数据只保存在本机，不提交 Git。仓库只保存公开来源、下载地址、版本/提交、导入方式和校验说明。这样能让每个人在需要时下载同一份真实数据，也避免把几百 MB 到数 GB 的数据塞进代码仓库。

默认目标是万级起步；MySQL、MongoDB、Cassandra、Neo4j、Elasticsearch、ClickHouse 和 Milvus 选择了更大的公开项目，Redis 与 InfluxDB 使用官方样例仓库中的完整数据集合。下载前请确认磁盘空间和站点许可。

## 下载

```bash
python3 fixtures/fetch.py mysql
python3 fixtures/fetch.py mongodb
python3 fixtures/fetch.py all
```

下载到 `fixtures/local/<database>/`，该目录已加入 `.gitignore`。脚本默认只下载原始公开文件，不会生成、改写或扩充数据。下载完成后按各目录 README 导入数据库。

## 数据源清单

| 数据库 | 公开项目 | 规模/特点 | 来源 |
| --- | --- | --- | --- |
| MySQL | Employees Test Database | 约 300,024 名员工、约 280 万条薪资记录，导出约 167 MB | [datacharmer/test_db](https://github.com/datacharmer/test_db) |
| MongoDB | Atlas Sample Data `sample_training` | 官方归档约 380 MB，包含训练/日志/电影等集合，适合索引、聚合和嵌套文档 | [MongoDB sample data](https://www.mongodb.com/docs/atlas/sample-data/) |
| Redis | World Cities | 15,493 条城市记录，可映射为 Hash、Geo、Search fixture | [redis-developer/redis-datasets](https://github.com/redis-developer/redis-datasets/tree/master/core/hashes) |
| Cassandra | GH Archive 单小时事件 | 固定小时的公开 GitHub 事件 JSONL，适合按仓库/时间分区；必要时可下载相邻小时扩大规模 | [GH Archive](https://www.gharchive.org/) |
| Neo4j | Stack Overflow Graph | 6,193 个节点、11,540 条关系，含问题、回答、标签、用户；另提供 dump 文件 | [neo4j-graph-examples/stackoverflow](https://github.com/neo4j-graph-examples/stackoverflow) |
| InfluxDB | InfluxDB 2.0 Sample Data | 官方仓库完整集合约 16,889 行 line protocol，覆盖空气、鸟类迁徙、地震和 NOAA | [influxdata/influxdb2-sample-data](https://github.com/influxdata/influxdb2-sample-data) |
| Elasticsearch | NYC Motor Vehicle Collisions | NYC Open Data 的持续更新事故数据，十万级以上，含官方 ingest pipeline 和 mapping 示例 | [Elastic example](https://github.com/elastic/examples/tree/master/Exploring%20Public%20Datasets/nyc_traffic_accidents) |
| ClickHouse | NYC Taxi January 2024 | 公开 Parquet 约 300 万行，适合 MergeTree、分区、聚合和时间范围查询；ClickHouse 官方教程长期使用该类数据 | [ClickHouse sample datasets](https://clickhouse.com/docs/getting-started/example-datasets) / [NYC TLC](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page) |
| Milvus | ANN SIFT10K | 公开向量检索基准，10,000 条、128 维，适合作为本地首个集合；后续可切换 SIFT1M | [ANN Benchmarks](https://github.com/erikbern/ann-benchmarks) / [TexMex](http://corpus-texmex.irisa.fr/) |

Neo4j 的 Stack Overflow dump 本身是 6k 节点/11k 关系，适合作为图模型首个可视化项目；如果验收需要严格万级节点规模，可切换到同组织的 Twitter graph dump。Milvus 的 SIFT10K 是精确万级基线；Cassandra 的 GH Archive 文件按小时切分，可按需要追加相邻小时。

## 许可和使用

下载前请遵循每个项目自己的 LICENSE、数据门户条款和速率限制。`fetch.py` 只做下载和 SHA-256 校验，不把第三方数据复制进本仓库。生产环境或对外发布前要重新核对数据许可和更新时间。
