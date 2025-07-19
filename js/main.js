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
                const fieldInfoAPI = new FieldInfoAPI();
                CONFIG.initialize(fieldInfoAPI);

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
                kintone.events.on('app.record.index.show', async (event) => {
                    console.log('現在のビュー名:', event.viewName);
                    console.log('設定されたビュー名:', CONFIG.system.viewName);
                    
                    if (event.viewName != CONFIG.system.viewName) {
                        console.log('ビュー名が一致しないため、処理をスキップします');
                        return;
                    }

                    try {
                        console.log('統合台帳検索システムを初期化中...');
                        
                        // フィールド情報を事前に取得
                        await this.preloadFieldInfo();
                        
                        // 検索メニューを初期化
                        await this.tabManager.initializeSearchMenu();
                        
                        console.log('統合台帳検索システムの初期化完了');
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
                console.log('フィールド情報の事前取得を開始...');
                
                // 全アプリのフィールド情報を一括取得
                const fieldsMap = await CONFIG.getAllAppFields();
                
                console.log('フィールド情報の事前取得完了:', fieldsMap);
                
                // 統合テーブルのカラム設定を動的生成
                const dynamicColumns = await CONFIG.generateIntegratedTableColumns();
                CONFIG.integratedTableConfig.columns = dynamicColumns;
                
                console.log('統合テーブルカラム設定を動的生成:', dynamicColumns);
                
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