/**
 * フィールド情報API管理クラス
 */
class FieldInfoAPI {
    constructor() {
        this.fieldCache = new Map(); // セッション内メモリキャッシュ
        this.loadingPromises = new Map(); // 重複リクエスト防止用
        this.localStoragePrefix = 'fieldInfo_'; // ローカルストレージのキープレフィックス
    }

    /**
     * アプリのフィールド情報を取得（メモリ + ローカルストレージキャッシュ機能付き）
     */
    async getAppFields(appId) {
        // メモリキャッシュから取得を試行（最高速）
        if (this.fieldCache.has(appId)) {
            return this.fieldCache.get(appId);
        }

        // ローカルストレージから取得を試行
        const cachedData = this.getFromLocalStorage(appId);
        if (cachedData) {
            console.log(`💿 ローカルストレージからフィールド情報取得: App ${appId}`);
            // メモリキャッシュにも保存
            this.fieldCache.set(appId, cachedData);
            return cachedData;
        }

        // 既に同じアプリの情報を取得中の場合は、そのPromiseを返す
        if (this.loadingPromises.has(appId)) {
            console.log(`⏳ フィールド情報取得待機中: App ${appId}`);
            return this.loadingPromises.get(appId);
        }

        // APIからフィールド情報を取得
        console.log(`🌐 APIからフィールド情報取得開始: App ${appId}`);
        const promise = this.fetchAppFields(appId);
        this.loadingPromises.set(appId, promise);

        try {
            const fields = await promise;
            // メモリキャッシュにも保存
            this.fieldCache.set(appId, fields);
            this.loadingPromises.delete(appId);
            return fields;
        } catch (error) {
            this.loadingPromises.delete(appId);
            throw error;
        }
    }

    /**
     * ローカルストレージからフィールド情報を取得
     */
    getFromLocalStorage(appId) {
        try {
            const key = this.localStoragePrefix + appId;
            const cached = localStorage.getItem(key);
            if (cached) {
                const data = JSON.parse(cached);
                // 有効期限チェック（24時間）
                if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
                    return data.fields;
                } else {
                    // 期限切れの場合は削除
                    localStorage.removeItem(key);
                }
            }
            return null;
        } catch (error) {
            console.warn(`ローカルストレージからの取得エラー (App ${appId}):`, error);
            return null;
        }
    }

    /**
     * ローカルストレージにフィールド情報を保存
     */
    saveToLocalStorage(appId, fields) {
        try {
            const key = this.localStoragePrefix + appId;
            const data = {
                fields: fields,
                timestamp: Date.now()
            };
            localStorage.setItem(key, JSON.stringify(data));
            console.log(`💿 ローカルストレージに保存: App ${appId} (${fields.length}件)`);
        } catch (error) {
            console.warn(`ローカルストレージへの保存エラー (App ${appId}):`, error);
        }
    }

    /**
     * kintone REST APIを使用してフィールド情報を取得
     */
    async fetchAppFields(appId) {
        try {
            // API実行回数をカウント
            window.apiCounter.count(appId, 'フィールド情報取得');
            
            const response = await kintone.api(
                kintone.api.url('/k/v1/app/form/fields', true),
                'GET',
                { app: appId }
            );

            const processedFields = this.processFieldData(response.properties);
            
            // ローカルストレージに保存
            this.saveToLocalStorage(appId, processedFields);
            
            console.log(`✓ App ${appId}(${CONFIG.apps[appId]?.name || 'Unknown'}) フィールド情報取得完了 (${processedFields.length}件)`);
            
            return processedFields;
        } catch (error) {
            console.error(`✗ App ${appId}のフィールド情報取得エラー:`, error);
            throw new Error(`フィールド情報の取得に失敗しました (App ${appId}): ${error.message}`);
        }
    }

    /**
     * ローカルストレージのキャッシュをクリア
     */
    clearLocalStorageCache() {
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.localStoragePrefix)) {
                    keys.push(key);
                }
            }
            keys.forEach(key => localStorage.removeItem(key));
            console.log(`🗑️ ローカルストレージキャッシュクリア完了 (${keys.length}件)`);
        } catch (error) {
            console.warn('ローカルストレージキャッシュクリアエラー:', error);
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
            return [];
        }

        // kintoneの選択肢は {label: "選択肢1", index: "0"} の形式
        const options = [];
        
        // 選択肢をindex順にソートしてから処理
        const sortedOptions = Object.values(fieldInfo.options)
            .filter(option => option.label && option.label.trim() !== '') // 空でないlabelのみ
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
}

// グローバルに公開
window.FieldInfoAPI = FieldInfoAPI; 