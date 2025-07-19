(function() {
    'use strict';

    /**
     * 統合台帳検索システム（モジュール統合版）
     */
    class LedgerSearchSystem {
        constructor() {
            this.init();
        }

        /**
         * システムを初期化
         */
        init() {
            // モジュールインスタンスを作成
            this.tabManager = new TabManager();
            this.searchEngine = new SearchEngine();
            this.dataIntegrator = new DataIntegrator();
            this.tableRenderer = new TableRenderer();

            // グローバルに公開（他のモジュールから参照できるように）
            window.tabManager = this.tabManager;
            window.searchEngine = this.searchEngine;
            window.dataIntegrator = this.dataIntegrator;
            window.tableRenderer = this.tableRenderer;

            // kintoneイベント登録
            kintone.events.on('app.record.index.show', (event) => {
                if (event.viewName != CONFIG.system.viewName) {
                    return;
                }
                this.tabManager.initializeSearchMenu();
                return event;
            });
        }
    }

    // システムを初期化
    new LedgerSearchSystem();

})(); 