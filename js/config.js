// 台帳設定をconfigオブジェクトで管理
const CONFIG = {
    // 統合キー
    integrationKey: '統合キー',
    
    // システム設定
    system: {
        viewName: '統合台帳検索',
        searchMenuId: 'search-menu',
        resultsContainerId: 'search-results',
        cursorSize: 500,
        messages: {
            noSearchCondition: '検索条件を入力してください。',
            noResults: '検索結果が見つかりませんでした。',
            searchError: '検索中にエラーが発生しました。',
            noIntegrationKeys: '統合キーが見つかりませんでした。',
            elementNotFound: '検索メニュー要素が見つかりません。',
            fieldInfoLoadError: 'フィールド情報の読み込みに失敗しました。'
        }
    },

    // 仮想スクロール設定
    virtualScroll: {
        rowHeight: 40,
        visibleRows: 15,
        bufferRows: 5
    },

    // ユーザーリスト設定
    userList: {
        appId: 13,
        name: 'ユーザーリスト'
    },

    // 台帳アプリ設定
    apps: {
        6: {
            name: 'PC台帳',
            // 表示したいフィールドを順序付きで指定
            displayFields: ['PC番号', 'ユーザーID', 'PC用途', 'test1', 'sample']
        },
        7: {
            name: '内線台帳',
            // 表示したいフィールドを順序付きで指定
            displayFields: ['内線番号', '電話機種別']
        },
        8: {
            name: '座席台帳',
            // 表示したいフィールドを順序付きで指定
            displayFields: ['座席拠点','階数', '座席番号','座席部署']
        }
    },

    // 統合テーブル表示設定
    integratedTableConfig: {
        columns: [
            // PC台帳グループ
            { key: 'PC台帳_PC番号', label: 'PC番号', width: '120px' },
            { key: 'PC台帳_ユーザーID', label: 'ユーザーID', width: '100px' },
            { key: 'PC台帳_PC用途', label: 'PC用途', width: '110px' },
            { key: 'PC台帳_test1', label: 'test1', width: '100px' },
            { key: 'PC台帳_sample', label: 'sample', width: '100px' },
            
            // 内線台帳グループ
            { key: '内線台帳_内線番号', label: '内線番号', width: '90px' },
            { key: '内線台帳_電話機種別', label: '電話機種別', width: '100px' },
            
            // 座席台帳グループ
            { key: '座席台帳_座席拠点', label: '座席拠点', width: '80px' },
            { key: '座席台帳_階数', label: '階数', width: '60px' },
            { key: '座席台帳_座席番号', label: '座席番号', width: '120px' },
            { key: '座席台帳_座席部署', label: '座席部署', width: '80px' },
            
            // ユーザー名
            { key: 'ユーザー名', label: 'ユーザー名', width: '120px' }
        ]
    },

    // FieldInfoAPIインスタンス
    fieldInfoAPI: null,

    /**
     * CONFIGを初期化
     */
    initialize: function(fieldInfoAPI) {
        this.fieldInfoAPI = fieldInfoAPI;
        console.log('CONFIG初期化完了');
    },

    /**
     * アプリのフィールド情報を取得
     */
    async getAppFields(appId) {
        try {
            if (!this.fieldInfoAPI) {
                throw new Error('FieldInfoAPIが初期化されていません');
            }

            return await this.fieldInfoAPI.getAppFields(appId);
        } catch (error) {
            console.error(`App ${appId}のフィールド情報取得エラー:`, error);
            throw error;
        }
    },

    /**
     * ユーザーリストのフィールド情報を取得
     */
    async getUserListFields() {
        return this.getAppFields(this.userList.appId);
    },

    /**
     * 全アプリのフィールド情報を取得
     */
    async getAllAppFields() {
        try {
            if (!this.fieldInfoAPI) {
                throw new Error('FieldInfoAPIが初期化されていません');
            }

            const appIds = Object.keys(this.apps);
            return await this.fieldInfoAPI.getMultipleAppFields(appIds);
        } catch (error) {
            console.error('全アプリのフィールド情報取得エラー:', error);
            throw error;
        }
    },

    /**
     * 統合テーブル用のカラム設定を動的生成
     */
    async generateIntegratedTableColumns() {
        try {
            const fieldsMap = await this.getAllAppFields();
            const columns = [];

            // 各台帳のフィールドを追加（displayFieldsで指定された順序で）
            Object.entries(this.apps).forEach(([appId, appConfig]) => {
                const fields = fieldsMap[appId] || [];
                const displayFields = appConfig.displayFields || [];
                
                // displayFieldsで指定された順序でフィールドを処理
                displayFields.forEach(fieldCode => {
                    // 統合キーは除外
                    if (fieldCode !== this.integrationKey) {
                        const field = fields.find(f => f.code === fieldCode);
                        if (field) {
                            const columnKey = `${appConfig.name}_${field.code}`;
                            // 静的設定から対応する幅を取得
                            const staticColumn = this.integratedTableConfig.columns.find(col => col.key === columnKey);
                            const width = staticColumn ? staticColumn.width : '120px'; // デフォルト幅
                            
                            columns.push({
                                key: columnKey,
                                label: field.label,
                                width: width
                            });
                        } else {
                            console.warn(`${appConfig.name}にフィールド「${fieldCode}」が見つかりません`);
                        }
                    }
                });
            });

            // ユーザー名カラムを追加
            const userNameColumn = this.integratedTableConfig.columns.find(col => col.key === 'ユーザー名');
            const userNameWidth = userNameColumn ? userNameColumn.width : '120px';
            columns.push({ key: 'ユーザー名', label: 'ユーザー名', width: userNameWidth });

            return columns;
        } catch (error) {
            console.error('統合テーブルカラム生成エラー:', error);
            // エラー時は静的設定にフォールバック
            return this.integratedTableConfig.columns;
        }
    }
}; 