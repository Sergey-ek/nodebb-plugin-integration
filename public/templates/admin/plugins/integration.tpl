<div class="acp-page-container">

    <h1>
        <i class="fa fa-robot"></i>
        {{tx("integration:menu-admin-title")}}
    </h1>

    <hr />

    <form role="form">

        <h3>{{tx("integration:admin-ai-provider")}}</h3>

        <div class="mb-3">
            <label class="form-label">{{tx("integration:admin-provider")}}</label>
            <select class="form-select" name="aiProvider">
                <option value="openai" <!-- IF settings.aiProviderOpenai -->selected<!-- ENDIF settings.aiProviderOpenai -->>
                    {{tx("integration:admin-openai")}}
                </option>
                <option value="fake" <!-- IF settings.aiProviderFake -->selected<!-- ENDIF settings.aiProviderFake -->>
                    {{tx("integration:admin-fake-provider")}}
                </option>
            </select>
            <div class="form-text">
                {{tx("integration:admin-fake-help")}}
            </div>
        </div>

        <h3>{{tx("integration:admin-openai")}}</h3>

        <div class="mb-3">
            <label class="form-label">{{tx("integration:admin-openai-key")}}</label>
            <input
                type="password"
                class="form-control"
                name="openaiApiKey"
                autocomplete="new-password"
                placeholder="{{tx("integration:admin-keep-key")}}"
            />
            <!-- IF settings.openaiConfigured -->
            <div class="form-text text-success">{{tx("integration:admin-key-configured")}}</div>
            <!-- ELSE -->
            <div class="form-text">{{tx("integration:admin-key-not-configured")}}</div>
            <!-- ENDIF settings.openaiConfigured -->
        </div>

        <div class="mb-3">
            <label class="form-label">{{tx("integration:admin-embedding-model")}}</label>
            <input
                class="form-control"
                name="openaiModel"
                value="{settings.openaiModel}"
            />
        </div>

        <div class="mb-3">
            <label class="form-label">{{tx("integration:admin-embedding-dimensions")}}</label>
            <input
                class="form-control"
                type="number"
                name="embeddingSize"
                value="{settings.embeddingSize}"
                min="1"
            />
            <div class="form-text">
                {{tx("integration:admin-embedding-help")}}
            </div>
        </div>

        <hr />

        <h3>{{tx("integration:admin-qdrant")}}</h3>

        <div class="mb-3">
            <label class="form-label">{{tx("integration:admin-qdrant-url")}}</label>
            <input
                class="form-control"
                name="qdrantUrl"
                value="{settings.qdrantUrl}"
            />
        </div>

        <div class="mb-3">
            <label class="form-label">{{tx("integration:admin-qdrant-collection")}}</label>
            <input
                class="form-control"
                name="collection"
                value="{settings.collection}"
            />
        </div>

        <hr />

        <h3>{{tx("integration:admin-indexing")}}</h3>

        <div class="mb-3">
            <label class="form-label">{{tx("integration:admin-excluded-categories")}}</label>
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
                {{tx("integration:admin-excluded-help")}}
            </div>
        </div>

        <hr />

        <h3>{{tx("integration:admin-mcp-server")}}</h3>

        <div class="form-check mb-3">
            <input
                class="form-check-input"
                type="checkbox"
                name="mcpEnabled"
                id="mcpEnabled"
                <!-- IF settings.mcpEnabled -->checked<!-- ENDIF settings.mcpEnabled -->
            />
            <label class="form-check-label" for="mcpEnabled">
                {{tx("integration:admin-enable-mcp")}}
            </label>
        </div>

        <div class="mb-3">
            <label class="form-label">{{tx("integration:admin-bind-address")}}</label>
            <input
                class="form-control"
                name="mcpHost"
                value="{settings.mcpHost}"
                placeholder="127.0.0.1"
            />
            <div class="form-text">
                {{tx("integration:admin-bind-help")}}
            </div>
        </div>

        <div class="mb-3">
            <label class="form-label">{{tx("integration:admin-http-port")}}</label>
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
            <label class="form-label">{{tx("integration:admin-nodebb-api-url")}}</label>
            <input
                class="form-control"
                name="mcpNodebbUrl"
                value="{settings.mcpNodebbUrl}"
                placeholder="http://127.0.0.1:4567"
            />
            <div class="form-text">
                {{tx("integration:admin-nodebb-api-help")}}
            </div>
        </div>

        <div class="mb-3">
            <label class="form-label">{{tx("integration:admin-auth-mode")}}</label>
            <select class="form-select" name="authMode">
                <option value="oauth" <!-- IF settings.authModeOauth -->selected<!-- ENDIF settings.authModeOauth -->>
                    {{tx("integration:admin-oauth")}}
                </option>
                <option value="legacy" <!-- IF settings.authModeLegacy -->selected<!-- ENDIF settings.authModeLegacy -->>
                    {{tx("integration:admin-legacy-bearer")}}
                </option>
            </select>
            <div class="form-text">
                {{tx("integration:admin-auth-help")}}
            </div>
        </div>

        <div class="mb-3">
            <label class="form-label">{{tx("integration:admin-bearer-token")}}</label>
            <div class="input-group">
                <input
                    class="form-control"
                    type="text"
                    name="mcpBearerToken"
                    value="{settings.mcpBearerToken}"
                    autocomplete="off"
                    readonly
                    spellcheck="false"
                />
                <button
                    class="btn btn-outline-secondary"
                    type="button"
                    id="copyMcpBearerToken"
                >
                    <i class="fa fa-copy"></i>
                    {{tx("integration:admin-copy")}}
                </button>
                <button
                    class="btn btn-outline-warning"
                    type="button"
                    id="regenerateMcpBearerToken"
                >
                    <i class="fa fa-refresh"></i>
                    {{tx("integration:admin-regenerate")}}
                </button>
            </div>
            <div class="form-text">
                {{tx("integration:admin-token-help")}}
            </div>
        </div>

        <div class="mb-3">
            <label class="form-label">{{tx("integration:admin-service-uid")}}</label>
            <input
                class="form-control"
                type="number"
                name="mcpServiceUid"
                value="{settings.mcpServiceUid}"
                min="1"
            />
            <div class="form-text">
                {{tx("integration:admin-service-uid-help")}}
            </div>
        </div>

        <hr />

        <button id="save" class="btn btn-primary" type="button">
            <i class="fa fa-save"></i>
            {{tx("integration:admin-save")}}
        </button>

    </form>

</div>
