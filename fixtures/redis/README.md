# Redis fixture

使用 Redis 官方生态 `worldcities.csv`，约 15,493 条城市记录。导入时可将每行映射成 `city:<id>` Hash，并额外建立 GEO、Search 索引和带 TTL 的最近访问列表。

```bash
python3 fixtures/fetch.py redis
```

来源：[redis-developer/redis-datasets](https://github.com/redis-developer/redis-datasets/tree/master/core/hashes)。
