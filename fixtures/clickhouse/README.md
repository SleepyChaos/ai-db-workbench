# ClickHouse fixture

使用 ClickHouse 文档长期采用的 NYC Taxi Parquet 数据，单月文件约 300 万行，适合 MergeTree、分区、聚合和时间范围查询。

```bash
python3 fixtures/fetch.py clickhouse
```

来源：[ClickHouse examples](https://github.com/ClickHouse/examples/tree/main/blog-examples/ParallelReplicasBench/datasets/uk_property_prices)。
