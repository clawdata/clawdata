````skill
---
name: azure
description: "Manage Azure cloud resources — resource groups, storage, databases, functions, and data services using the az CLI."
metadata: {"openclaw": {"emoji": "☁️", "requires": {"bins": ["az"]}, "tags": ["cloud", "azure", "storage", "database", "data", "microsoft"]}}
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

#### Create a storage account

```bash
az storage account create --name <account-name> --resource-group <rg> --location <region> --sku Standard_LRS
```

#### List containers in a storage account

```bash
az storage container list --account-name <account-name> --output table
```

#### Create a container

```bash
az storage container create --name <container-name> --account-name <account-name>
```

#### Upload a blob

```bash
az storage blob upload --account-name <account-name> --container-name <container> --name <blob-name> --file <local-path>
```

#### Download a blob

```bash
az storage blob download --account-name <account-name> --container-name <container> --name <blob-name> --file <local-path>
```

#### List blobs in a container

```bash
az storage blob list --account-name <account-name> --container-name <container> --output table
```

#### Delete a blob

```bash
az storage blob delete --account-name <account-name> --container-name <container> --name <blob-name>
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
- Tag resources with `--tags env=dev project=<name>` for organisation
- Use `--query` with JMESPath expressions to filter output
- Prefer managed identities over service principal secrets where possible
- Run `az account show` first to confirm you're targeting the correct subscription
- Use `--dry-run` where available to preview changes before applying

````
