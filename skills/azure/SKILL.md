````skill
---
name: azure
description: "Manage Azure cloud resources -- resource groups, storage, databases, functions, and data services using the az CLI."
metadata: {"openclaw": {"emoji": "☁️", "requires": {"bins": ["az"]}, "tags": ["cloud", "azure", "storage", "database", "data", "microsoft"], "secrets": [{"env_var": "AZURE_SUBSCRIPTION_ID", "label": "Azure Subscription ID", "placeholder": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}, {"env_var": "AZURE_TENANT_ID", "label": "Azure Tenant ID", "placeholder": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}, {"env_var": "AZURE_CLIENT_ID", "label": "Azure Client ID (Service Principal)", "placeholder": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "optional": true}, {"env_var": "AZURE_CLIENT_SECRET", "label": "Azure Client Secret", "placeholder": "secret value", "optional": true}]}}
---

# Azure

You help manage Azure cloud resources using the **`az`** CLI.
Use this when the user asks about Azure resource groups, storage accounts, SQL databases, Data Factory, Functions, or other Azure services.

## Authentication

Ensure the user has logged in:

```bash
az login
```

Or use a service principal:

```bash
az login --service-principal -u <app-id> -p <password> --tenant <tenant-id>
```

Set the active subscription:

```bash
az account set --subscription <subscription-id>
```

## Commands

### Account & Subscription

#### List subscriptions

```bash
az account list --output table
```

#### Show current subscription

```bash
az account show --output table
```

### Resource Groups

#### List resource groups

```bash
az group list --output table
```

#### Create a resource group

```bash
az group create --name <rg-name> --location <region>
```

#### Delete a resource group

```bash
az group delete --name <rg-name> --yes --no-wait
```

### Storage Accounts

#### List storage accounts

```bash
az storage account list --output table
```

#### Create a storage account (general-purpose v2)

```bash
az storage account create \
  --name <account-name> \
  --resource-group <rg> \
  --location <region> \
  --sku Standard_LRS \
  --kind StorageV2 \
  --tags env=dev project=<name>
```

#### Create a storage account with ADLS Gen2 (hierarchical namespace)

```bash
az storage account create \
  --name <account-name> \
  --resource-group <rg> \
  --location <region> \
  --sku Standard_LRS \
  --kind StorageV2 \
  --hns true \
  --tags env=dev project=<name>
```

#### Show storage account details

```bash
az storage account show --name <account-name> --resource-group <rg> --output table
```

#### Get connection string

```bash
az storage account show-connection-string --name <account-name> --resource-group <rg> --query connectionString -o tsv
```

#### Get access keys

```bash
az storage account keys list --account-name <account-name> --resource-group <rg> --output table
```

#### Regenerate an access key

```bash
az storage account keys renew --account-name <account-name> --resource-group <rg> --key primary
```

#### Enable soft delete for blobs

```bash
az storage account blob-service-properties update --account-name <account-name> --resource-group <rg> --enable-delete-retention true --delete-retention-days 7
```

#### Delete a storage account

```bash
az storage account delete --name <account-name> --resource-group <rg> --yes
```

### Containers & Blobs

#### List containers in a storage account

```bash
az storage container list --account-name <account-name> --output table --auth-mode login
```

#### Create a container

```bash
az storage container create --name <container-name> --account-name <account-name> --auth-mode login
```

#### Delete a container

```bash
az storage container delete --name <container-name> --account-name <account-name> --auth-mode login
```

#### Upload a blob

```bash
az storage blob upload --account-name <account-name> --container-name <container> --name <blob-name> --file <local-path> --auth-mode login
```

#### Upload a directory (batch)

```bash
az storage blob upload-batch --account-name <account-name> --destination <container> --source <local-dir> --auth-mode login
```

#### Download a blob

```bash
az storage blob download --account-name <account-name> --container-name <container> --name <blob-name> --file <local-path> --auth-mode login
```

#### Download a directory (batch)

```bash
az storage blob download-batch --account-name <account-name> --source <container> --destination <local-dir> --pattern "<prefix>*" --auth-mode login
```

#### List blobs in a container

```bash
az storage blob list --account-name <account-name> --container-name <container> --output table --auth-mode login
```

#### Delete a blob

```bash
az storage blob delete --account-name <account-name> --container-name <container> --name <blob-name> --auth-mode login
```

#### Generate a SAS token for a container

```bash
az storage container generate-sas --account-name <account-name> --name <container> --permissions rwdl --expiry $(date -u -v+1d '+%Y-%m-%dT%H:%MZ') --auth-mode login --as-user -o tsv
```

### Azure Data Lake Storage (ADLS Gen2)

#### Create a filesystem (container)

```bash
az storage fs create --name <filesystem> --account-name <account-name> --auth-mode login
```

#### List filesystems

```bash
az storage fs list --account-name <account-name> --auth-mode login --output table
```

#### Create a directory

```bash
az storage fs directory create --name <dir-path> --file-system <filesystem> --account-name <account-name> --auth-mode login
```

#### Upload a file

```bash
az storage fs file upload --source <local-path> --path <remote-path> --file-system <filesystem> --account-name <account-name> --auth-mode login
```

#### List files in a directory

```bash
az storage fs file list --file-system <filesystem> --path <dir-path> --account-name <account-name> --auth-mode login --output table
```

#### Set ACL on a directory

```bash
az storage fs access set --acl "user::rwx,group::r-x,other::---" --path <dir-path> --file-system <filesystem> --account-name <account-name> --auth-mode login
```

### Event Hubs

#### Create an Event Hubs namespace

```bash
az eventhubs namespace create --name <namespace> --resource-group <rg> --location <region> --sku Standard
```

#### Create an event hub

```bash
az eventhubs eventhub create --name <hub-name> --namespace-name <namespace> --resource-group <rg> --partition-count 4 --message-retention 1
```

#### List event hubs

```bash
az eventhubs eventhub list --namespace-name <namespace> --resource-group <rg> --output table
```

#### Get Event Hub connection string

```bash
az eventhubs namespace authorization-rule keys list --namespace-name <namespace> --resource-group <rg> --name RootManageSharedAccessKey --query primaryConnectionString -o tsv
```

#### Create a consumer group

```bash
az eventhubs eventhub consumer-group create --name <group-name> --eventhub-name <hub-name> --namespace-name <namespace> --resource-group <rg>
```

### Azure SQL Database

#### List SQL servers

```bash
az sql server list --output table
```

#### List databases on a server

```bash
az sql db list --resource-group <rg> --server <server-name> --output table
```

#### Create a database

```bash
az sql db create --resource-group <rg> --server <server-name> --name <db-name> --service-objective S0
```

#### Execute a query (via sqlcmd or connection string)

```bash
az sql db show-connection-string --server <server-name> --name <db-name> --client sqlcmd
```

### Azure Data Factory

#### List data factories

```bash
az datafactory list --resource-group <rg> --output table
```

#### List pipelines

```bash
az datafactory pipeline list --resource-group <rg> --factory-name <factory-name> --output table
```

#### Trigger a pipeline run

```bash
az datafactory pipeline create-run --resource-group <rg> --factory-name <factory-name> --name <pipeline-name>
```

#### Show pipeline run status

```bash
az datafactory pipeline-run show --resource-group <rg> --factory-name <factory-name> --run-id <run-id>
```

### Azure Functions

#### List function apps

```bash
az functionapp list --output table
```

#### Create a function app

```bash
az functionapp create --resource-group <rg> --consumption-plan-location <region> --runtime python --runtime-version 3.11 --functions-version 4 --name <app-name> --storage-account <storage-account>
```

#### Deploy a function app

```bash
az functionapp deployment source config-zip --resource-group <rg> --name <app-name> --src <zip-path>
```

#### Show function app settings

```bash
az functionapp config appsettings list --resource-group <rg> --name <app-name> --output table
```

#### Set an app setting

```bash
az functionapp config appsettings set --resource-group <rg> --name <app-name> --settings <KEY>=<VALUE>
```

### Azure Key Vault

#### List key vaults

```bash
az keyvault list --output table
```

#### Get a secret

```bash
az keyvault secret show --vault-name <vault-name> --name <secret-name> --query value -o tsv
```

#### Set a secret

```bash
az keyvault secret set --vault-name <vault-name> --name <secret-name> --value <secret-value>
```

#### List secrets

```bash
az keyvault secret list --vault-name <vault-name> --output table
```

### Azure Monitor & Logs

#### List recent activity log entries

```bash
az monitor activity-log list --resource-group <rg> --offset 1h --output table
```

#### Query Log Analytics workspace

```bash
az monitor log-analytics query --workspace <workspace-id> --analytics-query "<KQL-query>" --output table
```

### Networking

#### List virtual networks

```bash
az network vnet list --output table
```

#### List public IP addresses

```bash
az network public-ip list --output table
```

## Best Practices

- Always use `--output table` for readable output or `--output json` for programmatic use
- Use `--no-wait` for long-running operations when you don't need to block
- Tag resources with `--tags env=dev project=<name>` for organisation and cost tracking
- Use `--query` with JMESPath expressions to filter output
- Prefer managed identities over service principal secrets where possible
- Run `az account show` first to confirm you're targeting the correct subscription
- Use `--dry-run` where available to preview changes before applying
- Use `--auth-mode login` for storage commands to authenticate via Azure AD instead of access keys
- When creating a storage account for Functions or Event Hubs, create the resource group first, then the storage account, then the dependent service
- Use `StorageV2` kind for new storage accounts (most flexible)
- Enable hierarchical namespace (`--hns true`) when using ADLS Gen2 or data lake patterns
- Enable soft delete and versioning on production storage accounts
- Use lifecycle management policies to tier old data to cool/archive storage

## Common Workflows

### Create a complete Function App setup

```bash
# 1. Resource group
az group create --name <rg> --location <region>

# 2. Storage account (required by Functions)
az storage account create --name <storage-name> --resource-group <rg> --location <region> --sku Standard_LRS --kind StorageV2

# 3. Function app
az functionapp create --resource-group <rg> --consumption-plan-location <region> --runtime python --runtime-version 3.11 --functions-version 4 --name <app-name> --storage-account <storage-name>
```

### Create an Event Hub streaming setup

```bash
# 1. Resource group
az group create --name <rg> --location <region>

# 2. Storage account (for checkpointing)
az storage account create --name <storage-name> --resource-group <rg> --location <region> --sku Standard_LRS --kind StorageV2

# 3. Checkpoint container
az storage container create --name eventhub-checkpoints --account-name <storage-name> --auth-mode login

# 4. Event Hubs namespace + hub
az eventhubs namespace create --name <namespace> --resource-group <rg> --location <region> --sku Standard
az eventhubs eventhub create --name <hub-name> --namespace-name <namespace> --resource-group <rg> --partition-count 4

# 5. Consumer group
az eventhubs eventhub consumer-group create --name <group-name> --eventhub-name <hub-name> --namespace-name <namespace> --resource-group <rg>
```

### Set up a Data Lake (ADLS Gen2)

```bash
# 1. Resource group
az group create --name <rg> --location <region>

# 2. Storage account with hierarchical namespace
az storage account create --name <storage-name> --resource-group <rg> --location <region> --sku Standard_LRS --kind StorageV2 --hns true

# 3. Create filesystems (medallion layers)
az storage fs create --name bronze --account-name <storage-name> --auth-mode login
az storage fs create --name silver --account-name <storage-name> --auth-mode login
az storage fs create --name gold --account-name <storage-name> --auth-mode login
```

````
