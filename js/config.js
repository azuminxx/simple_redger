// 台帳設定をconfigオブジェクトで管理
const CONFIG = {
    // 各台帳の統合キーフィールド名
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
        rowHeight: 32,
        visibleRows: 20,
        bufferRows: 5
    },

    // 台帳アプリ設定
    apps: {
        6: { name: 'PC台帳' },
        7: { name: '内線台帳' },
        8: { name: '座席台帳' }
    },

    // ユーザーリスト設定
    userList: {
        appId: 13,
        name: 'ユーザーリスト',
        primaryKey: 'ユーザーID',
        mapFields: ['ユーザー名','ユーザー部署']
    },

    // 共通グループ設定
    commonLedger: {
        name: '共通',
        keys: ['change-flag', 'detail-link']
    },

    // 統合テーブル表示設定
    integratedTableConfig: {
        columns: [
            // PC台帳グループ
            { key: 'PC台帳_PC番号', appId: 6, ledger: 'PC台帳', fieldCode: 'PC番号', primaryKey: true, label: 'PC番号', width: '120px', readOnly: true, required: false },
            { key: 'PC台帳_ユーザーID', appId: 6, ledger: 'PC台帳', fieldCode: 'ユーザーID', primaryKey: false, label: 'ユーザーID', width: '100px', readOnly: false, required: false },
            { key: 'PC台帳_ユーザー名', appId: 13, ledger: 'PC台帳', fieldCode: 'ユーザー名', primaryKey: false, label: 'ユーザー名', width: '120px', readOnly: true, isUserListDerived: true, required: false },
            { key: 'PC台帳_ユーザー部署', appId: 13, ledger: 'PC台帳', fieldCode: 'ユーザー部署', primaryKey: false, label: 'ユーザー部署', width: '120px', readOnly: true, isUserListDerived: true, required: false },
            { key: 'PC台帳_PC用途', appId: 6, ledger: 'PC台帳', fieldCode: 'PC用途', primaryKey: false, label: 'PC用途', width: '130px', readOnly: false, required: true },
            { key: 'PC台帳_test1', appId: 6, ledger: 'PC台帳', fieldCode: 'test1', primaryKey: false, label: 'test1', width: '100px', readOnly: false, required: false },
            { key: 'PC台帳_sample', appId: 6, ledger: 'PC台帳', fieldCode: 'sample', primaryKey: false, label: 'sample', width: '100px', readOnly: false, required: false },
            
            // 内線台帳グループ
            { key: '内線台帳_内線番号', appId: 7, ledger: '内線台帳', fieldCode: '内線番号', primaryKey: true, label: '内線番号', width: '90px', readOnly: true, required: false },
            { key: '内線台帳_電話機種別', appId: 7, ledger: '内線台帳', fieldCode: '電話機種別', primaryKey: false, label: '電話機種別', width: '100px', readOnly: false, required: true },
            
            // 座席台帳グループ
            { key: '座席台帳_座席拠点', appId: 8, ledger: '座席台帳', fieldCode: '座席拠点', primaryKey: false, label: '座席拠点', width: '80px', readOnly: false, required: true },
            { key: '座席台帳_階数', appId: 8, ledger: '座席台帳', fieldCode: '階数', primaryKey: false, label: '階数', width: '60px', readOnly: false, required: true },
            { key: '座席台帳_座席番号', appId: 8, ledger: '座席台帳', fieldCode: '座席番号', primaryKey: true, label: '座席番号', width: '120px', readOnly: true, required: false },
            { key: '座席台帳_座席部署', appId: 8, ledger: '座席台帳', fieldCode: '座席部署', primaryKey: false, label: '座席部署', width: '80px', readOnly: false, required: false }
        ]
    },

    // フィールドフィルタリング設定
    fieldFiltering: {
        // スキップするシステムフィールド
        systemFields: ['$id', '$revision', 'レコード番号', '作成者', '作成日時', '更新者', '更新日時'],
        
        // サポートしないフィールドタイプ
        unsupportedTypes: [
            'SUBTABLE', 'FILE', 'REFERENCE_TABLE', 'GROUP', 'SPACER',
            'HR', 'CATEGORY', 'STATUS', 'STATUS_ASSIGNEE', 'CREATED_TIME',
            'UPDATED_TIME', 'CREATOR', 'MODIFIER'
        ]
    },

    // フィールドタイプマッピング設定
    fieldTypeMapping: {
        'SINGLE_LINE_TEXT': 'text',
        'MULTI_LINE_TEXT': 'text',
        'RICH_TEXT': 'text',
        'NUMBER': 'number',
        'CALC': 'text', // 計算フィールドは読み取り専用だが検索では文字列として扱う
        'DROP_DOWN': 'dropdown',
        'RADIO_BUTTON': 'radio',
        'CHECK_BOX': 'checkbox',
        'DATE': 'date',
        'DATETIME': 'datetime-local',
        'TIME': 'time',
        'LINK': 'text',
        'USER_SELECT': 'text' // ユーザー選択フィールドは文字列として扱う
    },

    // デフォルトフィールドタイプ
    defaultFieldType: 'text',

    // 台帳名の配列（処理順序用）
    get ledgerNames() {
        return Object.values(this.apps).map(app => app.name);
    },

    /**
     * 台帳名からappIdを取得
     */
    getAppIdByLedgerName(ledgerName) {
        const entry = Object.entries(this.apps).find(([appId, config]) => 
            config.name === ledgerName
        );
        return entry ? entry[0] : null;
    },

    /**
     * 指定台帳の更新フィールド構成を取得
     */
    getLedgerUpdateFields(ledgerName) {
        const updateFields = {};
        
        // 自台帳のフィールド（primaryKey: falseのフィールドを動的に取得）
        const ownFields = this.integratedTableConfig.columns
            .filter(column => column.ledger === ledgerName && !column.primaryKey && !column.isChangeFlag && !column.isDetailLink)
            .map(column => column.fieldCode);
        
        ownFields.forEach(fieldCode => {
            updateFields[fieldCode] = {
                sourceKey: `${ledgerName}_${fieldCode}`,
                fieldCode: fieldCode
            };
        });
        
        // 他台帳からの参照フィールド（appsオブジェクトから動的に取得）
        Object.values(this.apps).forEach(app => {
            if (app.name !== ledgerName) {
                // 他台帳の主キーフィールドを取得
                const primaryKeyColumns = this.integratedTableConfig.columns
                    .filter(column => column.ledger === app.name && column.primaryKey);
                
                primaryKeyColumns.forEach(column => {
                    updateFields[column.fieldCode] = {
                        sourceKey: `${app.name}_${column.fieldCode}`,
                        fieldCode: column.fieldCode
                    };
                });
            }
        });
        
        return updateFields;
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
     * 全アプリのフィールド情報を取得
     */
    async getAllAppFields() {
        try {
            if (!window.fieldInfoAPI) {
                throw new Error('FieldInfoAPIが初期化されていません');
            }
            // 台帳アプリ＋ユーザーリストアプリのappIdをまとめて取得
            const appIds = [...Object.keys(this.apps), this.userList.appId];
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