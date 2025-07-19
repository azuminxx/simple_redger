/**
 * フィールド情報API管理クラス
 */
class FieldInfoAPI {
    constructor() {
        this.fieldCache = new Map(); // アプリIDをキーとしたフィールド情報キャッシュ
        this.loadingPromises = new Map(); // 重複リクエスト防止用
    }

    /**
     * アプリのフィールド情報を取得（キャッシュ機能付き）
     */
    async getAppFields(appId) {
        // キャッシュから取得を試行
        if (this.fieldCache.has(appId)) {
            console.log(`App ${appId}のフィールド情報をキャッシュから取得`);
            return this.fieldCache.get(appId);
        }

        // 既に同じアプリの情報を取得中の場合は、そのPromiseを返す
        if (this.loadingPromises.has(appId)) {
            console.log(`App ${appId}のフィールド情報取得中...`);
            return this.loadingPromises.get(appId);
        }

        // APIからフィールド情報を取得
        const promise = this.fetchAppFields(appId);
        this.loadingPromises.set(appId, promise);

        try {
            const fields = await promise;
            this.fieldCache.set(appId, fields);
            this.loadingPromises.delete(appId);
            return fields;
        } catch (error) {
            this.loadingPromises.delete(appId);
            throw error;
        }
    }

    /**
     * kintone REST APIを使用してフィールド情報を取得
     */
    async fetchAppFields(appId) {
        try {
            console.log(`App ${appId}のフィールド情報をAPIから取得中...`);
            
            const response = await kintone.api(
                kintone.api.url('/k/v1/app/form/fields', true),
                'GET',
                { app: appId }
            );

            const processedFields = this.processFieldData(response.properties);
            console.log(`App ${appId}のフィールド情報取得完了:`, processedFields);
            
            return processedFields;
        } catch (error) {
            console.error(`App ${appId}のフィールド情報取得エラー:`, error);
            throw new Error(`フィールド情報の取得に失敗しました (App ${appId}): ${error.message}`);
        }
    }

    /**
     * APIレスポンスのフィールドデータを処理
     */
    processFieldData(properties) {
        const fields = [];

        Object.entries(properties).forEach(([fieldCode, fieldInfo]) => {
            // システムフィールドやサブテーブルなどをスキップ
            if (this.shouldSkipField(fieldCode, fieldInfo)) {
                return;
            }

            const processedField = this.createFieldConfig(fieldCode, fieldInfo);
            if (processedField) {
                fields.push(processedField);
            }
        });

        return fields;
    }

    /**
     * スキップすべきフィールドかどうかを判定
     */
    shouldSkipField(fieldCode, fieldInfo) {
        // システムフィールド
        const systemFields = ['$id', '$revision', 'レコード番号', '作成者', '作成日時', '更新者', '更新日時'];
        if (systemFields.includes(fieldCode)) {
            return true;
        }

        // サポートしないフィールドタイプ
        const unsupportedTypes = [
            'SUBTABLE', 'FILE', 'REFERENCE_TABLE', 'GROUP', 'SPACER',
            'HR', 'CATEGORY', 'STATUS', 'STATUS_ASSIGNEE', 'CREATED_TIME',
            'UPDATED_TIME', 'CREATOR', 'MODIFIER'
        ];
        
        if (unsupportedTypes.includes(fieldInfo.type)) {
            return true;
        }

        return false;
    }

    /**
     * フィールド設定オブジェクトを作成
     */
    createFieldConfig(fieldCode, fieldInfo) {
        const baseConfig = {
            code: fieldCode,
            label: fieldInfo.label,
            type: this.mapFieldType(fieldInfo.type),
            placeholder: `${fieldInfo.label}を入力`
        };

        // ドロップダウン・ラジオボタン・チェックボックスの選択肢を処理
        if (fieldInfo.type === 'DROP_DOWN' || fieldInfo.type === 'RADIO_BUTTON' || fieldInfo.type === 'CHECK_BOX') {
            console.log(`選択肢フィールド検出: ${fieldCode} (${fieldInfo.type})`);
            baseConfig.options = this.extractOptions(fieldInfo);
        }

        // 数値フィールドの場合
        if (fieldInfo.type === 'NUMBER') {
            baseConfig.placeholder = `${fieldInfo.label}を入力（数値）`;
        }

        // 日付・時刻フィールドの場合
        if (fieldInfo.type === 'DATE') {
            baseConfig.placeholder = `${fieldInfo.label}を選択（YYYY-MM-DD）`;
        }

        if (fieldInfo.type === 'DATETIME') {
            baseConfig.placeholder = `${fieldInfo.label}を選択（YYYY-MM-DD HH:mm）`;
        }

        return baseConfig;
    }

    /**
     * kintoneのフィールドタイプを検索フォーム用タイプにマッピング
     */
    mapFieldType(kintoneType) {
        const typeMapping = {
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
        };

        return typeMapping[kintoneType] || 'text';
    }

    /**
     * ドロップダウンなどの選択肢を抽出
     */
    extractOptions(fieldInfo) {
        if (!fieldInfo.options) {
            console.log(`${fieldInfo.label}: 選択肢が存在しません`);
            return [''];
        }

        // kintoneの選択肢は {label: "選択肢1", index: "0"} の形式
        const options = ['']; // 空の選択肢を最初に追加
        
        // 選択肢をindex順にソートしてから処理
        const sortedOptions = Object.values(fieldInfo.options)
            .filter(option => option.label) // labelが存在するもののみ
            .sort((a, b) => {
                // indexを数値として比較してソート
                const indexA = parseInt(a.index) || 0;
                const indexB = parseInt(b.index) || 0;
                return indexA - indexB;
            });

        // ソート済みの選択肢を順番に追加
        sortedOptions.forEach(option => {
            options.push(option.label);
        });

        console.log(`${fieldInfo.label}: 選択肢を${options.length - 1}個取得（index順） ->`, options.slice(1));
        return options;
    }

    /**
     * 複数のアプリのフィールド情報を一括取得
     */
    async getMultipleAppFields(appIds) {
        const promises = appIds.map(appId => this.getAppFields(appId));
        
        try {
            const results = await Promise.all(promises);
            const fieldsMap = {};
            
            appIds.forEach((appId, index) => {
                fieldsMap[appId] = results[index];
            });
            
            return fieldsMap;
        } catch (error) {
            console.error('複数アプリのフィールド情報取得エラー:', error);
            throw error;
        }
    }

    /**
     * キャッシュをクリア
     */
    clearCache(appId = null) {
        if (appId) {
            this.fieldCache.delete(appId);
            console.log(`App ${appId}のフィールド情報キャッシュをクリア`);
        } else {
            this.fieldCache.clear();
            console.log('全フィールド情報キャッシュをクリア');
        }
    }

    /**
     * 特定のフィールドタイプのフィールドのみを取得
     */
    getFieldsByType(appId, targetType) {
        const fields = this.fieldCache.get(appId);
        if (!fields) {
            throw new Error(`App ${appId}のフィールド情報がキャッシュされていません`);
        }

        return fields.filter(field => field.type === targetType);
    }

    /**
     * フィールドコードからフィールド情報を取得
     */
    getFieldByCode(appId, fieldCode) {
        const fields = this.fieldCache.get(appId);
        if (!fields) {
            throw new Error(`App ${appId}のフィールド情報がキャッシュされていません`);
        }

        return fields.find(field => field.code === fieldCode);
    }
}

// グローバルに公開
window.FieldInfoAPI = FieldInfoAPI; 