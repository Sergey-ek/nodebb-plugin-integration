<div class="acp-page-container">

    <h1>
        <i class="fa fa-robot"></i>
        {{title}}
    </h1>

    <hr />

    <form role="form">

        <h3>AI Provider</h3>

        <div class="mb-3">
            <label class="form-label">Provider</label>
            <select class="form-select" name="aiProvider">
                <option value="openai" <!-- IF settings.aiProviderOpenai -->selected<!-- ENDIF settings.aiProviderOpenai -->>
                    OpenAI
                </option>
                <option value="fake" <!-- IF settings.aiProviderFake -->selected<!-- ENDIF settings.aiProviderFake -->>
                    Fake (AI disabled)
                </option>
            </select>
            <div class="form-text">
                Fake disables AI embeddings, indexing, semantic search and Qdrant access.
                NodeBB and MCP tools remain available.
            </div>
        </div>

        <h3>OpenAI</h3>

        <div class="mb-3">
            <label class="form-label">OpenAI API Key</label>
            <input
                type="password"
                class="form-control"
                name="openaiApiKey"
                autocomplete="new-password"
                placeholder="Leave empty to keep the current key"
            />
            <!-- IF settings.openaiConfigured -->
            <div class="form-text text-success">API key is configured</div>
            <!-- ELSE -->
            <div class="form-text">API key is not configured</div>
            <!-- ENDIF settings.openaiConfigured -->
        </div>

        <div class="mb-3">
            <label class="form-label">Embedding Model</label>
            <input
                class="form-control"
                name="openaiModel"
                value="{settings.openaiModel}"
            />
        </div>

        <div class="mb-3">
            <label class="form-label">Embedding Dimensions</label>
            <input
                class="form-control"
                type="number"
                name="embeddingSize"
                value="{settings.embeddingSize}"
                min="1"
            />
            <div class="form-text">
                The default dimension for text-embedding-3-small is 1536.
                Changing this value requires a matching Qdrant collection.
            </div>
        </div>

        <hr />

        <h3>Qdrant</h3>

        <div class="mb-3">
            <label class="form-label">Qdrant URL</label>
            <input
                class="form-control"
                name="qdrantUrl"
                value="{settings.qdrantUrl}"
            />
        </div>

        <div class="mb-3">
            <label class="form-label">Qdrant Collection</label>
            <input
                class="form-control"
                name="collection"
                value="{settings.collection}"
            />
        </div>

        <hr />

        <h3>Indexing</h3>

        <div class="mb-3">
            <label class="form-label">Excluded Categories</label>
            <select
                class="form-select"
                name="excludedCategories"
                multiple
                size="10"
            >
                <!-- BEGIN categories -->
                <option value="{categories.cid}" <!-- IF categories.selected -->selected<!-- ENDIF categories.selected -->>
                    {categories.name}
                </option>
                <!-- END categories -->
            </select>
            <div class="form-text">
                Posts in selected categories are excluded from indexing and search.
            </div>
        </div>

        <hr />

        <h3>MCP Server</h3>

        <div class="form-check mb-3">
            <input
                class="form-check-input"
                type="checkbox"
                name="mcpEnabled"
                id="mcpEnabled"
                <!-- IF settings.mcpEnabled -->checked<!-- ENDIF settings.mcpEnabled -->
            />
            <label class="form-check-label" for="mcpEnabled">
                Enable MCP Server
            </label>
        </div>

        <div class="mb-3">
            <label class="form-label">Bind Address</label>
            <input
                class="form-control"
                name="mcpHost"
                value="{settings.mcpHost}"
                placeholder="127.0.0.1"
            />
            <div class="form-text">
                127.0.0.1 allows local connections only.
                0.0.0.0 listens on all network interfaces.
            </div>
        </div>

        <div class="mb-3">
            <label class="form-label">HTTP Port</label>
            <input
                class="form-control"
                type="number"
                name="mcpPort"
                value="{settings.mcpPort}"
                min="1"
                max="65535"
            />
        </div>

        <div class="mb-3">
            <label class="form-label">NodeBB API URL</label>
            <input
                class="form-control"
                name="mcpNodebbUrl"
                value="{settings.mcpNodebbUrl}"
                placeholder="http://127.0.0.1:4567"
            />
            <div class="form-text">
                Base URL used by the MCP process to access the internal NodeBB API.
                Use an address reachable from the MCP process environment.
            </div>
        </div>

        <div class="mb-3">
            <label class="form-label">MCP Bearer Token</label>
            <input
                class="form-control"
                type="password"
                name="mcpBearerToken"
                autocomplete="new-password"
                placeholder="Leave empty to keep the current token"
            />
            <!-- IF settings.mcpBearerTokenConfigured -->
            <div class="form-text text-success">Bearer token is configured</div>
            <!-- ELSE -->
            <div class="form-text">Bearer token is not configured</div>
            <!-- ENDIF settings.mcpBearerTokenConfigured -->
        </div>

        <div class="mb-3">
            <label class="form-label">NodeBB Service UID</label>
            <input
                class="form-control"
                type="number"
                name="mcpServiceUid"
                value="{settings.mcpServiceUid}"
                min="1"
            />
            <div class="form-text">
                NodeBB user ID used by MCP for search and access-control checks.
            </div>
        </div>

        <hr />

        <button id="save" class="btn btn-primary" type="button">
            <i class="fa fa-save"></i>
            Save Settings
        </button>

    </form>

</div>
