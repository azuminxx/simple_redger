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
        async init() {
            try {
                // フィールド情報API を初期化
                this.fieldInfoAPI = new FieldInfoAPI();
                CONFIG.initialize();

                // モジュールインスタンスを作成
                this.tabManager = new TabManager();
                this.searchEngine = new SearchEngine();
                this.dataIntegrator = new DataIntegrator();
                this.tableRenderer = new TableRenderer();
                this.apiCounter = new APICounter();

                // グローバルに公開（他のモジュールから参照できるように）
                if (window.fieldInfoAPI) {
                    console.warn('⚠️ window.fieldInfoAPIが既に存在します - 上書きします');
                }
                window.fieldInfoAPI = this.fieldInfoAPI;
                window.tabManager = this.tabManager;
                window.searchEngine = this.searchEngine;
                window.dataIntegrator = this.dataIntegrator;
                window.apiCounter = this.apiCounter;
                window.tableRenderer = this.tableRenderer;

                // kintoneイベント登録
                kintone.events.on('app.record.index.show', async (event) => {
                    if (event.viewName != CONFIG.system.viewName) {
                        return;
                    }

                    try {
                        console.log('🚀 統合台帳検索システム初期化中...');
                        
                        // フィールド情報を事前に取得
                        await this.preloadFieldInfo();
                        
                        // 検索メニューを初期化
                        await this.tabManager.initializeSearchMenu();
                        
                        console.log('✅ システム初期化完了');
                    } catch (error) {
                        console.error('システム初期化エラー:', error);
                        alert(`${CONFIG.system.messages.fieldInfoLoadError}\n詳細: ${error.message}`);
                    }

                    return event;
                });
            } catch (error) {
                console.error('システム初期化エラー:', error);
            }
        }

        /**
         * フィールド情報を事前に取得・キャッシュ
         */
        async preloadFieldInfo() {
            try {
                // 全アプリのフィールド情報を一括取得
                const fieldsMap = await CONFIG.getAllAppFields();
                
                // 統合テーブルのカラム設定を動的生成
                const dynamicColumns = await CONFIG.generateIntegratedTableColumns();
                
                // 変更フラグ列を最初に追加
                const columnsWithChangeFlag = [{
                    key: 'change-flag',
                    label: '変更',
                    ledger: '操作',
                    fieldCode: 'change-flag',
                    appId: null,
                    isChangeFlag: true
                }, ...dynamicColumns];
                
                CONFIG.integratedTableConfig.columns = columnsWithChangeFlag;
                
                console.log(`📋 統合テーブル設定完了 (${dynamicColumns.length}列)`);
                
            } catch (error) {
                console.error('フィールド情報事前取得エラー:', error);
                // エラーでも処理を続行（静的設定にフォールバック）
                console.warn('静的設定にフォールバックします');
            }
        }
    }

    // システムを初期化
    new LedgerSearchSystem();

})(); 