# MySQL fixture

使用 Employees Test Database。它约有 300,024 名员工和约 280 万条薪资记录，适合验证库表树、关联查询、索引和分页。

```bash
python3 fixtures/fetch.py mysql
mkdir -p fixtures/local/mysql/unpacked
tar -xzf fixtures/local/mysql/employees.tar.gz -C fixtures/local/mysql/unpacked --strip-components=1
mysql < fixtures/local/mysql/unpacked/employees.sql
```

来源：[datacharmer/test_db](https://github.com/datacharmer/test_db)。
