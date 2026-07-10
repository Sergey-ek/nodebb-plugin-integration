<div class="acp-page-container">

    <h1>
        <i class="fa fa-robot"></i>
        {{title}}
    </h1>

    <hr />

    <form role="form">

        <div class="mb-3">

            <label class="form-label">
                {{settings.ai-provider}}
            </label>

            <select
                class="form-select"
                name="aiProvider"
            >
                <option value="fake">Fake</option>
                <option value="openai">OpenAI</option>
            </select>

        </div>

        <div class="mb-3">

            <label class="form-label">
                OpenAI API Key
            </label>

            <input
                type="password"
                class="form-control"
                name="openaiApiKey"
                autocomplete="off"
            />

        </div>

        <div class="mb-3">

            <label class="form-label">
                OpenAI Embedding Model
            </label>

            <input
                class="form-control"
                name="openaiModel"
            />

        </div>

        <div class="mb-3">

            <label class="form-label">
                Qdrant URL
            </label>

            <input
                class="form-control"
                name="qdrantUrl"
            />

        </div>

        <div class="mb-3">

            <label class="form-label">
                Collection
            </label>

            <input
                class="form-control"
                name="collection"
            />

        </div>

        <div class="form-check mb-3">

            <input
                id="mcpEnabled"
                class="form-check-input"
                type="checkbox"
                name="mcpEnabled"
            />

            <label
                class="form-check-label"
                for="mcpEnabled"
            >
                Enable MCP Server
            </label>

        </div>

        <div class="mb-3">

            <label class="form-label">
                MCP Port
            </label>

            <input
                class="form-control"
                name="mcpPort"
                type="number"
            />

        </div>

        <hr />

        <button
            id="save"
            class="btn btn-primary"
            type="button"
        >

            <i class="fa fa-save"></i>

            Save Settings

        </button>

    </form>

</div>