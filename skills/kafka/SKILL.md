---
name: kafka
description: "Work with Apache Kafka — manage topics, produce/consume messages, inspect consumer groups, and monitor clusters."
metadata: {"openclaw": {"emoji": "📨", "requires": {"bins": ["kafka-topics"]}, "tags": ["streaming", "kafka", "messaging", "events", "data"]}}
---

# Kafka

You help manage Apache Kafka clusters using the Kafka CLI tools.
Use this when the user asks about topics, messages, consumer groups, or Kafka cluster management.

## Bootstrap Server

Most commands require `--bootstrap-server <broker:port>`. Default is typically `localhost:9092`.

## Commands

### Topics

#### List topics

```bash
kafka-topics --bootstrap-server localhost:9092 --list
```

#### Describe a topic

```bash
kafka-topics --bootstrap-server localhost:9092 --describe --topic <topic_name>
```

#### Create a topic

```bash
kafka-topics --bootstrap-server localhost:9092 --create --topic <topic_name> --partitions 6 --replication-factor 1
```

#### Delete a topic

```bash
kafka-topics --bootstrap-server localhost:9092 --delete --topic <topic_name>
```

#### Alter topic partitions

```bash
kafka-topics --bootstrap-server localhost:9092 --alter --topic <topic_name> --partitions 12
```

### Producing Messages

#### Produce from stdin

```bash
kafka-console-producer --bootstrap-server localhost:9092 --topic <topic_name>
```

#### Produce with key

```bash
kafka-console-producer --bootstrap-server localhost:9092 --topic <topic_name> --property parse.key=true --property key.separator=:
```

### Consuming Messages

#### Consume from beginning

```bash
kafka-console-consumer --bootstrap-server localhost:9092 --topic <topic_name> --from-beginning --max-messages 10
```

#### Consume with key and timestamp

```bash
kafka-console-consumer --bootstrap-server localhost:9092 --topic <topic_name> --from-beginning --max-messages 10 --property print.key=true --property print.timestamp=true
```

### Consumer Groups

#### List consumer groups

```bash
kafka-consumer-groups --bootstrap-server localhost:9092 --list
```

#### Describe a consumer group (check lag)

```bash
kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group <group_id>
```

#### Reset offsets

```bash
kafka-consumer-groups --bootstrap-server localhost:9092 --group <group_id> --topic <topic_name> --reset-offsets --to-earliest --execute
```

## Best Practices

- Use meaningful topic naming: `<domain>.<entity>.<event>` (e.g. `orders.payments.completed`)
- Set appropriate partition counts based on throughput needs
- Monitor consumer lag to detect processing bottlenecks
- Use Avro/Protobuf with Schema Registry for production topics
- Configure retention policies based on use case (`retention.ms`)
- Use compacted topics for slowly changing reference data
