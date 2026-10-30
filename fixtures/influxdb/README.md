# InfluxDB fixture

使用 InfluxDB 官方 2.0 sample data 仓库完整集合，约 16,889 行 line protocol，包含空气传感器、鸟类迁徙、NOAA 和地震数据。

```bash
python3 fixtures/fetch.py influxdb
mkdir -p fixtures/local/influxdb/unpacked
tar -xzf fixtures/local/influxdb/influxdb2-sample-data.tar.gz -C fixtures/local/influxdb/unpacked --strip-components=1
```

来源：[influxdata/influxdb2-sample-data](https://github.com/influxdata/influxdb2-sample-data)。
