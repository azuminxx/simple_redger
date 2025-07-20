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
            name: 'PC台帳'
        },
        7: {
            name: '内線台帳'
        },
        8: {
            name: '座席台帳'
        }
    },

    // 統合テーブル表示設定
    integratedTableConfig: {
        columns: [
            // PC台帳グループ
            { key: 'PC台帳_PC番号', label: 'PC番号', width: '120px', appId: 6, fieldCode: 'PC番号' },
            { key: 'PC台帳_ユーザーID', label: 'ユーザーID', width: '100px', appId: 6, fieldCode: 'ユーザーID' },
            { key: 'PC台帳_ユーザー名', label: 'ユーザー名', width: '120px', appId: 6, fieldCode: 'ユーザー名', isUserListDerived: true },
            { key: 'PC台帳_PC用途', label: 'PC用途', width: '130px', appId: 6, fieldCode: 'PC用途' },
            { key: 'PC台帳_test1', label: 'test1', width: '100px', appId: 6, fieldCode: 'test1' },
            { key: 'PC台帳_sample', label: 'sample', width: '100px', appId: 6, fieldCode: 'sample' },
            
            // 内線台帳グループ
            { key: '内線台帳_内線番号', label: '内線番号', width: '90px', appId: 7, fieldCode: '内線番号' },
            { key: '内線台帳_電話機種別', label: '電話機種別', width: '100px', appId: 7, fieldCode: '電話機種別' },
            
            // 座席台帳グループ
            { key: '座席台帳_座席拠点', label: '座席拠点', width: '80px', appId: 8, fieldCode: '座席拠点' },
            { key: '座席台帳_階数', label: '階数', width: '60px', appId: 8, fieldCode: '階数' },
            { key: '座席台帳_座席番号', label: '座席番号', width: '120px', appId: 8, fieldCode: '座席番号' },
            { key: '座席台帳_座席部署', label: '座席部署', width: '80px', appId: 8, fieldCode: '座席部署' }
        ]
    },

    /**
     * CONFIGを初期化
     */
    initialize: function(fieldInfoAPI) {
        // fieldInfoAPIは使用せず、window.fieldInfoAPIを使用
        console.log('⚙️ CONFIG初期化完了');
    },

    /**
     * 指定されたアプリの表示フィールドを取得
     */
    getDisplayFields: function(appId, excludeUserListDerived = false) {
        let columns = this.integratedTableConfig.columns.filter(column => column.appId == appId);
        
        // ユーザーリスト由来のフィールドを除外する場合
        if (excludeUserListDerived) {
            columns = columns.filter(column => !column.isUserListDerived);
        }
        
        return columns.map(column => column.fieldCode);
    },

    /**
     * アプリのフィールド情報を取得
     * @deprecated グローバルのwindow.fieldInfoAPIを直接使用してください
     */
    async getAppFields(appId) {
        console.warn('⚠️ CONFIG.getAppFields は非推奨です。window.fieldInfoAPI.getAppFields を直接使用してください。');
        return await window.fieldInfoAPI.getAppFields(appId);
    },

    /**
     * ユーザーリストのフィールド情報を取得
     */
    async getUserListFields() {
        return await window.fieldInfoAPI.getAppFields(this.userList.appId);
    },

    /**
     * 全アプリのフィールド情報を取得
     */
    async getAllAppFields() {
        try {
            if (!window.fieldInfoAPI) {
                throw new Error('FieldInfoAPIが初期化されていません');
            }

            const appIds = Object.keys(this.apps);
            return await window.fieldInfoAPI.getMultipleAppFields(appIds);
        } catch (error) {
            console.error('全アプリのフィールド情報取得エラー:', error);
            throw error;
        }
    },

    /**
     * 統合テーブル用のカラム設定を取得（動的生成は不要、静的設定を返す）
     */
    async generateIntegratedTableColumns() {
        // 静的設定をそのまま返す（動的生成は不要）
        return this.integratedTableConfig.columns;
    }
}; 