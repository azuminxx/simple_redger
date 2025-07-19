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
            noIntegrationKeys: '統合キーが見つかりませんでした。'
        }
    },

    // 仮想スクロール設定
    virtualScroll: {
        rowHeight: 45,        // 1行の高さ（px）
        visibleRows: 100,     // 表示する行数
        bufferRows: 10,       // 上下のバッファ行数
        containerHeight: 500  // テーブルコンテナの高さ（px）
    },

    // 共通フィールド定義（重複排除）
    commonFields: {
        'PC番号': { code: 'PC番号', label: 'PC番号', type: 'text', placeholder: 'PC番号を入力' },
        '内線番号': { code: '内線番号', label: '内線番号', type: 'text', placeholder: '内線番号を入力' },
        'ユーザーID': { code: 'ユーザーID', label: 'ユーザーID', type: 'text', placeholder: 'ユーザーIDを入力' },
        '座席番号': { code: '座席番号', label: '座席番号', type: 'text', placeholder: '座席番号を入力' },
        'ユーザー名': { code: 'ユーザー名', label: 'ユーザー名', type: 'text', placeholder: 'ユーザー名を入力' },
        '階数': { code: '階数', label: '階数', type: 'text', placeholder: '階数を入力' },
        '座席部署': { code: '座席部署', label: '座席部署', type: 'text', placeholder: '座席部署を入力' }
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
        fields: ['ユーザーID', 'ユーザー名']
    },
    
    apps: {
        6: {
            name: 'PC台帳',
            fields: [
                'PC番号', '内線番号', 'ユーザーID', '座席番号',
                { 
                    code: 'PC用途', 
                    label: 'PC用途', 
                    type: 'dropdown', 
                    options: ['', '個人専用', 'CO/TOブース', 'RPA用', '拠点設備用', '会議用', '在庫']
                }
            ]
        },
        7: {
            name: '内線台帳',
            fields: [
                'PC番号', '内線番号', 'ユーザーID', '座席番号',
                { 
                    code: '電話機種別', 
                    label: '電話機種別', 
                    type: 'dropdown', 
                    options: ['', 'ACD', 'ビジネス']
                }
            ]
        },
        8: {
            name: '座席台帳',
            fields: [
                'PC番号', '内線番号', 'ユーザーID', '座席番号', '階数', '座席部署',
                { 
                    code: '座席拠点', 
                    label: '座席拠点', 
                    type: 'dropdown', 
                    options: ['', '埼玉', '池袋', '文京', '浦和']
                }
            ]
        }
    },

    // フィールド設定を解決するヘルパー関数
    resolveField: function(fieldRef) {
        if (typeof fieldRef === 'string') {
            return this.commonFields[fieldRef];
        }
        return fieldRef;
    },

    // アプリのフィールド設定を解決
    getAppFields: function(appId) {
        const app = this.apps[appId];
        if (!app) return [];
        
        return app.fields.map(field => this.resolveField(field)).filter(Boolean);
    },
    
    // ユーザーリストのフィールド設定を解決
    getUserListFields: function() {
        return this.userList.fields.map(field => this.resolveField(field)).filter(Boolean);
    }
}; 