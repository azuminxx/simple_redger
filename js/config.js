// 台帳設定をconfigオブジェクトで管理
const CONFIG = {
    // 統合キーフィールド名
    integrationKey: '統合キー',
    
    // システム設定
    system: {
        viewName: 'カスタマイズビュー',
        searchMenuId: 'search-menu',
        resultsContainerId: 'search-results',
        cursorSize: 500,
        defaultColumnWidth: '120px',
        messages: {
            noSearchCondition: '検索条件を入力してください。',
            noResults: '検索結果が0件のため、統合検索は実行されません。',
            searchError: '検索中にエラーが発生しました。',
            elementNotFound: 'search-menu要素が見つかりません',
            noIntegrationKeys: '統合キーが見つかりませんでした。',
            fieldInfoLoadError: 'フィールド情報の取得に失敗しました。'
        }
    },

    // 仮想スクロール設定
    virtualScroll: {
        rowHeight: 45,        // 1行の高さ（px）
        visibleRows: 100,     // 表示する行数
        bufferRows: 10,       // 上下のバッファ行数
        containerHeight: 500  // テーブルコンテナの高さ（px）
    },
    
    // 統合テーブル表示設定
    integratedTableConfig: {
        columns: [
            // 共通グループ
            { key: '統合キー', label: '統合キー', width: '280px' },
            
            // PC台帳グループ  
            { key: 'PC台帳_PC番号', label: 'PC番号', width: '120px' },
            { key: 'PC台帳_ユーザーID', label: 'ユーザーID', width: '100px' },
            { key: 'PC台帳_PC用途', label: 'PC用途', width: '110px' },
            
            // 内線台帳グループ
            { key: '内線台帳_内線番号', label: '内線番号', width: '90px' },
            { key: '内線台帳_電話機種別', label: '電話機種別', width: '100px' },
            
            // 座席台帳グループ
            { key: '座席台帳_座席番号', label: '座席番号', width: '120px' },
            { key: '座席台帳_階数', label: '階数', width: '60px' },
            { key: '座席台帳_座席部署', label: '座席部署', width: '80px' },
            { key: '座席台帳_座席拠点', label: '座席拠点', width: '80px' },
            
            // ユーザー名（ユーザーリストから取得）
            { key: 'ユーザー名', label: 'ユーザー名', width: '120px' }
        ]
    },
    
    // ユーザーリスト設定（統合キーを持たない）
    userList: {
        appId: 13,
        name: 'ユーザーリスト',
        fields: ['ユーザーID', 'ユーザー名'] // 静的定義は残す（フィールドコードのみ）
    },
    
    // 台帳アプリ設定（動的フィールド情報取得対応）
    apps: {
        6: {
            name: 'PC台帳',
            // fieldsプロパティは削除し、動的取得に移行
        },
        7: {
            name: '内線台帳',
            // fieldsプロパティは削除し、動的取得に移行
        },
        8: {
            name: '座席台帳',
            // fieldsプロパティは削除し、動的取得に移行
        }
    },

    // フィールド情報API インスタンス（初期化時に設定）
    fieldInfoAPI: null,

    // 動的フィールド情報キャッシュ
    dynamicFields: {},

    /**
     * システムを初期化（フィールド情報APIを設定）
     */
    initialize: function(fieldInfoAPI) {
        this.fieldInfoAPI = fieldInfoAPI;
    },

    /**
     * アプリのフィールド設定を動的に取得
     */
    async getAppFields(appId) {
        if (!this.fieldInfoAPI) {
            throw new Error('FieldInfoAPIが初期化されていません');
        }

        try {
            // キャッシュから取得を試行
            if (this.dynamicFields[appId]) {
                return this.dynamicFields[appId];
            }

            // APIから動的取得
            const fields = await this.fieldInfoAPI.getAppFields(appId);
            this.dynamicFields[appId] = fields;
            
            return fields;
        } catch (error) {
            console.error(`App ${appId}のフィールド情報取得エラー:`, error);
            throw error;
        }
    },
    
    /**
     * ユーザーリストのフィールド設定を動的に取得
     */
    async getUserListFields() {
        return this.getAppFields(this.userList.appId);
    },

    /**
     * 複数アプリのフィールド情報を一括取得
     */
    async getAllAppFields() {
        if (!this.fieldInfoAPI) {
            throw new Error('FieldInfoAPIが初期化されていません');
        }

        try {
            const appIds = Object.keys(this.apps).map(id => parseInt(id));
            appIds.push(this.userList.appId); // ユーザーリストも含める

            const fieldsMap = await this.fieldInfoAPI.getMultipleAppFields(appIds);
            
            // キャッシュに保存
            Object.entries(fieldsMap).forEach(([appId, fields]) => {
                this.dynamicFields[appId] = fields;
            });

            return fieldsMap;
        } catch (error) {
            console.error('全アプリのフィールド情報取得エラー:', error);
            throw error;
        }
    },

    /**
     * 特定のフィールドコードの情報を取得
     */
    async getFieldByCode(appId, fieldCode) {
        const fields = await this.getAppFields(appId);
        return fields.find(field => field.code === fieldCode);
    },

    /**
     * 統合テーブル用のカラム設定を動的生成
     */
    async generateIntegratedTableColumns() {
        try {
            const fieldsMap = await this.getAllAppFields();
            const columns = [];

            // 統合キーカラムを追加
            columns.push({ key: this.integrationKey, label: this.integrationKey, width: '280px' });

            // 各台帳のフィールドを追加
            Object.entries(this.apps).forEach(([appId, appConfig]) => {
                const fields = fieldsMap[appId] || [];
                
                fields.forEach(field => {
                    // 統合キーは除外
                    if (field.code !== this.integrationKey) {
                        columns.push({
                            key: `${appConfig.name}_${field.code}`,
                            label: field.label,
                            width: this.calculateColumnWidth(field)
                        });
                    }
                });
            });

            // ユーザー名カラムを追加
            columns.push({ key: 'ユーザー名', label: 'ユーザー名', width: '120px' });

            return columns;
        } catch (error) {
            console.error('統合テーブルカラム生成エラー:', error);
            // エラー時は静的設定にフォールバック
            return this.integratedTableConfig.columns;
        }
    },

    /**
     * フィールドタイプに基づいてカラム幅を計算
     */
    calculateColumnWidth(field) {
        const widthMap = {
            'text': '120px',
            'number': '100px',
            'dropdown': '110px',
            'date': '120px',
            'datetime-local': '150px',
            'checkbox': '80px',
            'radio': '100px'
        };

        return widthMap[field.type] || this.system.defaultColumnWidth;
    },

    /**
     * フィールド情報キャッシュをクリア
     */
    clearFieldsCache: function(appId = null) {
        if (appId) {
            delete this.dynamicFields[appId];
            if (this.fieldInfoAPI) {
                this.fieldInfoAPI.clearCache(appId);
            }
        } else {
            this.dynamicFields = {};
            if (this.fieldInfoAPI) {
                this.fieldInfoAPI.clearCache();
            }
        }
    },

    /**
     * 後方互換性のための旧メソッド（非推奨）
     */
    resolveField: function(fieldRef) {
        console.warn('resolveField()は非推奨です。動的フィールド取得を使用してください。');
        if (typeof fieldRef === 'string') {
            return { code: fieldRef, label: fieldRef, type: 'text', placeholder: `${fieldRef}を入力` };
        }
        return fieldRef;
    }
}; 