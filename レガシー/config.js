/**
 * 🏢 統合台帳システム v2 - 設定ファイル
 * @description シンプル化された設定・定数管理
 * @version 2.0.0
 */
(function() {
    'use strict';

    // グローバル名前空間の初期化
    window.LedgerV2 = window.LedgerV2 || {};

    // =============================================================================
    // 📚 アプリケーション設定
    // =============================================================================

    // アプリケーションID設定
    const APP_IDS = {
        SEAT: 8,       // 座席台帳アプリ
        PC: 6,         // PC台帳アプリ
        EXT: 7,        // 内線台帳アプリ
        USER: 13,      // ユーザー台帳アプリ
        HISTORY: 14    // 更新履歴台帳アプリ
    };

    // アプリURLマッピング
    const APP_URL_MAPPINGS = {
        'seat_record_id': `/k/${APP_IDS.SEAT}/`,
        'pc_record_id': `/k/${APP_IDS.PC}/`,
        'ext_record_id': `/k/${APP_IDS.EXT}/`,
        'user_record_id': `/k/${APP_IDS.USER}/`,
        'history_record_id': `/k/${APP_IDS.HISTORY}/`
    };

    // =============================================================================
    // 🎯 定数定義
    // =============================================================================

    // =============================================================================
    // 📝 フィールド設定で使用可能な値一覧（参考用）
    // =============================================================================
    
    // cellType: 'text', 'input', 'dropdown', 'row_number', 'modification_checkbox', 'hide_button'
    // updateMode: 'static', 'dynamic'
    // category: '共通', '座席台帳', 'PC台帳', '内線台帳', 'ユーザー台帳'
    // filterType: 'text', 'dropdown'
    // searchOperator: '=', 'like', 'in'
    // searchValueFormatter: 'exact', 'prefix', 'list'
    // editableFrom: 'all', 'static'

    // =============================================================================
    // 📋 フィールド設定（シンプル化版）
    // =============================================================================

    const fieldsConfig = [
        // 行番号
        {
            fieldCode: '_row_number',
            label: '🔢',
            width: '20px',
            cellType: 'row_number',
            updateMode: 'static',
            category: '共通',
            filterType: 'text',
            searchOperator: 'like',
            searchValueFormatter: 'prefix',
            editableFrom: 'static',
            isRowNumber: true,
            showInModalPreview: false
        },

        // 変更チェックボックス
        {
            fieldCode: '_modification_checkbox',
            label: '✅',
            width: '20px',
            cellType: 'modification_checkbox',
            updateMode: 'static',
            category: '共通',
            filterType: 'text',
            searchOperator: 'like',
            searchValueFormatter: 'prefix',
            editableFrom: 'static',
            isModificationCheckbox: true,
            showInModalPreview: false
        },

        // 台帳不整合表示
        {
            fieldCode: '_ledger_inconsistency',
            label: '⚠️',
            width: '20px',
            cellType: 'ledger_inconsistency',
            updateMode: 'static',
            category: '共通',
            filterType: 'text',
            searchOperator: 'like',
            searchValueFormatter: 'prefix',
            editableFrom: 'static',
            isLedgerInconsistency: true,
            showInModalPreview: false
        },

        // 非表示ボタン
        {
            fieldCode: '_hide_button',
            label: '👁️‍🗨️',
            width: '20px',
            cellType: 'hide_button',
            updateMode: 'static',
            category: '共通',
            filterType: 'text',
            searchOperator: 'like',
            searchValueFormatter: 'prefix',
            editableFrom: 'static',
            isHideButton: true,
            showInModalPreview: false
        },

        // PC台帳フィールド
        {
            fieldCode: 'pc_record_id',
            label: '💻 PC-ID',
            width: '0px',
            cellType: 'text',
            updateMode: 'static',
            category: '共通',
            filterType: 'text',
            searchOperator: '=',
            searchValueFormatter: 'exact',
            editableFrom: 'static',
            isRecordId: true,
            sourceApp: 'PC',
            showInModalPreview: false,
            isHiddenFromUser: true
        },
        {
            fieldCode: 'PC番号',
            label: '💻 PC番号',
            width: '150px',
            cellType: 'text',
            updateMode: 'static',
            category: 'PC台帳',
            filterType: 'text',
            searchOperator: 'like',
            searchValueFormatter: 'prefix',
            editableFrom: 'static',
            sourceApp: 'PC',
            isPrimaryKey: true,
            allowCellDragDrop: true,
            showInModalPreview: true
        },
        {
            fieldCode: 'PC用途',
            label: '🎯 PC用途',
            width: '100px',
            cellType: 'dropdown',
            updateMode: 'dynamic',
            category: 'PC台帳',
            options: [
                { value: '個人専用', label: '個人専用' },
                { value: 'CO/TOブース', label: 'CO/TOブース' },
                { value: 'RPA用', label: 'RPA用' },
                { value: '拠点設備用', label: '拠点設備用' },
                { value: '会議用', label: '会議用' },
                { value: '在庫', label: '在庫' }
            ],
            filterType: 'dropdown',
            searchOperator: 'in',
            searchValueFormatter: 'list',
            editableFrom: 'all',
            sourceApp: 'PC',
            showInModalPreview: true
        },
        {
            fieldCode: 'test1',
            label: '🎯 test1',
            width: '100px',
            cellType: 'dropdown',
            updateMode: 'dynamic',
            category: 'PC台帳',
            options: [
                { value: 'sample1', label: 'sample1' },
                { value: 'sample2', label: 'sample2' },
                { value: 'sample3', label: 'sample3' }
            ],
            filterType: 'dropdown',
            searchOperator: 'in',
            searchValueFormatter: 'list',
            editableFrom: 'all',
            sourceApp: 'PC',
            showInModalPreview: true
        },
        {
            fieldCode: 'sample',
            label: '🎯 sample',
            width: '100px',
            cellType: 'dropdown',
            updateMode: 'dynamic',
            category: 'PC台帳',
            options: [
                { value: 'sample1', label: 'sample1' },
                { value: 'sample2', label: 'sample2' }
            ],
            filterType: 'dropdown',
            searchOperator: 'in',
            searchValueFormatter: 'list',
            editableFrom: 'all',
            sourceApp: 'PC',
            showInModalPreview: true
        },
        // ユーザー台帳フィールド
        {
            fieldCode: 'user_record_id',
            label: '👥 USER-ID',
            width: '0px',
            cellType: 'text',
            updateMode: 'static',
            category: '共通',
            filterType: 'text',
            searchOperator: '=',
            searchValueFormatter: 'exact',
            editableFrom: 'static',
            isRecordId: true,
            sourceApp: 'USER',
            showInModalPreview: false,
            isHiddenFromUser: true
        },
        {
            fieldCode: 'ユーザーID',
            label: '🆔 ユーザーID',
            width: '100px',
            cellType: 'text',
            updateMode: 'static',
            category: 'ユーザー台帳',
            filterType: 'text',
            searchOperator: 'like',
            searchValueFormatter: 'prefix',
            editableFrom: 'static',
            sourceApp: 'USER',
            isPrimaryKey: true,
            allowCellDragDrop: true,
            showInModalPreview: true
        },
        {
            fieldCode: 'ユーザー名',
            label: '👤 ユーザー名',
            width: '100px',
            cellType: 'input',
            updateMode: 'dynamic',
            category: 'ユーザー台帳',
            filterType: 'text',
            searchOperator: 'like',
            searchValueFormatter: 'prefix',
            editableFrom: 'all',
            sourceApp: 'USER',
            showInModalPreview: true
        },

        // 内線台帳フィールド
        {
            fieldCode: 'ext_record_id',
            label: '☎️ 内線ID',
            width: '0px',
            cellType: 'text',
            updateMode: 'static',
            category: '共通',
            filterType: 'text',
            searchOperator: '=',
            searchValueFormatter: 'exact',
            editableFrom: 'static',
            isRecordId: true,
            sourceApp: 'EXT',
            showInModalPreview: false,
            isHiddenFromUser: true
        },
        {
            fieldCode: '内線番号',
            label: '☎️ 内線番号',
            width: '90px',
            cellType: 'text',
            updateMode: 'static',
            category: '内線台帳',
            filterType: 'text',
            searchOperator: 'like',
            searchValueFormatter: 'prefix',
            editableFrom: 'static',
            sourceApp: 'EXT',
            isPrimaryKey: true,
            allowCellDragDrop: true,
            showInModalPreview: true
        },
        {
            fieldCode: '電話機種別',
            label: '📱 電話機種別',
            width: '80px',
            cellType: 'dropdown',
            updateMode: 'dynamic',
            category: '内線台帳',
            options: [
                { value: 'ビジネス', label: 'ビジネス' },
                { value: 'ACD', label: 'ACD' }
            ],
            filterType: 'dropdown',
            searchOperator: 'in',
            searchValueFormatter: 'list',
            editableFrom: 'all',
            sourceApp: 'EXT',
            showInModalPreview: true
        },

        // 座席台帳フィールド
        {
            fieldCode: 'seat_record_id',
            label: '🪑 座席ID',
            width: '0px',
            cellType: 'text',
            updateMode: 'static',
            category: '共通',
            filterType: 'text',
            searchOperator: '=',
            searchValueFormatter: 'exact',
            editableFrom: 'static',
            isRecordId: true,
            sourceApp: 'SEAT',
            showInModalPreview: false,
            isHiddenFromUser: true
        },
        {
            fieldCode: '座席番号',
            label: '🪑 座席番号',
            width: '130px',
            cellType: 'text',
            updateMode: 'static',
            category: '座席台帳',
            filterType: 'text',
            searchOperator: 'like',
            searchValueFormatter: 'prefix',
            editableFrom: 'static',
            sourceApp: 'SEAT',
            isPrimaryKey: true,
            allowCellDragDrop: true,
            showInModalPreview: true
        },
        {
            fieldCode: '座席拠点',
            label: '📍 座席拠点',
            width: '80px',
            cellType: 'dropdown',
            updateMode: 'dynamic',
            category: '座席台帳',
            options: [
                { value: '池袋', label: '池袋' },
                { value: '埼玉', label: '埼玉' },
                { value: '文京', label: '文京' },
                { value: '浦和', label: '浦和' }
            ],
            filterType: 'dropdown',
            searchOperator: 'in',
            searchValueFormatter: 'list',
            editableFrom: 'all',
            sourceApp: 'SEAT',
            showInModalPreview: true
        },
        {
            fieldCode: '階数',
            label: '🔢 階数',
            width: '70px',
            cellType: 'input',
            updateMode: 'dynamic',
            category: '座席台帳',
            filterType: 'text',
            searchOperator: 'like',
            searchValueFormatter: 'prefix',
            editableFrom: 'all',
            sourceApp: 'SEAT',
            allowFillHandle: true,
            showInModalPreview: true
        },
        {
            fieldCode: '座席部署',
            label: '🏢 座席部署',
            width: '70px',
            cellType: 'input',
            updateMode: 'dynamic',
            category: '座席台帳',
            filterType: 'text',
            searchOperator: 'like',
            searchValueFormatter: 'prefix',
            editableFrom: 'all',
            sourceApp: 'SEAT',
            showInModalPreview: true
        }, 
    ];

    // =============================================================================
    // 📏 UI設定（シンプル版）
    // =============================================================================

    const UI_SETTINGS = {
        FONT_SIZE: '11px',
        CELL_PADDING: '1px',
        BORDER_COLOR: '#ccc',
        HIGHLIGHT_COLOR: '#fff3e0',
        MODIFIED_COLOR: '#ffeb3b'
    };

    // =============================================================================
    // 📋 履歴管理システム設定
    // =============================================================================

    // 履歴管理用フィールド設定
    const HISTORY_FIELDS_CONFIG = {
        // 更新日時
        update_date: {
            fieldCode: '更新日時',
            label: '📅 更新日時',
            type: 'datetime',
            width: '150px',
            showInTable: true,
            showInModal: true,
            sortable: true
        },

        // 更新者
        updater: {
            fieldCode: '更新者',
            label: '👤 更新者',
            type: 'text',
            width: '100px',
            showInTable: true,
            showInModal: true,
            sortable: true
        },

        // バッチID（更新処理のグループ化用）
        batch_id: {
            fieldCode: 'バッチID',
            label: '🔢 バッチID',
            type: 'text',
            width: '120px',
            showInTable: true,
            showInModal: true,
            sortable: true
        },

        // 台帳種別
        ledger_type: {
            fieldCode: '台帳種別',
            label: '📋 台帳種別',
            type: 'dropdown',
            width: '100px',
            options: [
                { value: 'PC台帳', label: 'PC台帳' },
                { value: 'ユーザー台帳', label: 'ユーザー台帳' },
                { value: '座席台帳', label: '座席台帳' },
                { value: '内線台帳', label: '内線台帳' }
            ],
            showInTable: true,
            showInModal: true,
            sortable: true
        },

        // レコードID
        record_id: {
            fieldCode: 'レコードID',
            label: '🆔 レコードID',
            type: 'text',
            width: '80px',
            showInTable: false,
            showInModal: true,
            sortable: false
        },

        // レコードキー
        record_key: {
            fieldCode: 'レコードキー',
            label: '🔑 レコードキー',
            type: 'text',
            width: '120px',
            showInTable: true,
            showInModal: true,
            sortable: true
        },

        // 更新内容
        changes: {
            fieldCode: '更新内容',
            label: '📝 更新内容',
            type: 'multi_line_text',
            width: '200px',
            showInTable: true,
            showInModal: true,
            sortable: false
        },

        // 申請可否
        requires_approval: {
            fieldCode: '申請可否',
            label: '📋 申請可否',
            type: 'dropdown',
            width: '100px',
            options: [
                { value: '申請必要', label: '申請必要' },
                { value: '申請不要', label: '申請不要' }
            ],
            showInTable: true,
            showInModal: true,
            sortable: true
        },

        // 申請状況
        application_status: {
            fieldCode: '申請状況',
            label: '📊 申請状況',
            type: 'dropdown',
            width: '100px',
            options: [
                { value: '申請不要', label: '申請不要' },
                { value: '未申請', label: '未申請' },
                { value: '申請中', label: '申請中' },
                { value: '申請完了', label: '申請完了' },
                { value: '期限超過', label: '期限超過' }
            ],
            showInTable: true,
            showInModal: true,
            sortable: true
        },

        // 申請番号
        application_number: {
            fieldCode: '申請番号',
            label: '📄 申請番号',
            type: 'text',
            width: '120px',
            showInTable: true,
            showInModal: true,
            sortable: true
        },

        // 申請期限
        application_deadline: {
            fieldCode: '申請期限',
            label: '⏰ 申請期限',
            type: 'date',
            width: '120px',
            showInTable: true,
            showInModal: true,
            sortable: true
        }
    };

    // =============================================================================
    // 🌐 グローバル公開
    // =============================================================================

    // 設定をグローバルスコープに公開
    window.LedgerV2.Config = {
        APP_IDS,
        APP_URL_MAPPINGS,
        fieldsConfig,
        UI_SETTINGS,
        HISTORY_FIELDS_CONFIG
    };

    // レガシー互換性のため一部をwindowに直接公開
    window.APP_IDS = APP_IDS;
    window.fieldsConfig = fieldsConfig;

    console.log('✅ LedgerV2 設定システム初期化完了');

})();
