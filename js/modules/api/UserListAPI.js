/**
 * ユーザー台帳検索APIクラス
 */
class UserListAPI {
    constructor() {
        this.appId = CONFIG.userList.appId;
        this.primaryKey = CONFIG.userList.primaryKey;
        this.mapFields = CONFIG.userList.mapFields;
    }

    /**
     * BSSIDでユーザー情報を検索（大文字・小文字の両方でin検索）
     */
    async searchUserById(userId) {
        if (!userId || userId.trim() === '') {
            return null;
        }

        try {
            // 入力されたBSSIDの大文字・小文字の両方で検索
            const upperUserId = userId.toUpperCase();
            const lowerUserId = userId.toLowerCase();
            
            // 大文字・小文字の両方でin検索
            const query = `${this.primaryKey} in ("${upperUserId}", "${lowerUserId}")`;
            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
                app: this.appId,
                query: query
            });
            console.log('[DEBUG] response:', response);
            if (response.records && response.records.length > 0) {
                return response.records[0];
            }
            return null;
        } catch (error) {
            console.error('ユーザー台帳検索エラー:', error);
            return null;
        }
    }

    /**
     * ユーザー情報からmapFieldsの値を取得
     */
    getUserMapValues(userRecord) {
        if (!userRecord) {
            return {};
        }

        const mapValues = {};
        this.mapFields.forEach(fieldName => {
            const fieldValue = userRecord[fieldName];
            mapValues[fieldName] = fieldValue && fieldValue.value !== undefined 
                ? fieldValue.value 
                : fieldValue;
        });

        return mapValues;
    }

    /**
     * BSSIDからmapFieldsの値を取得（検索付き）
     */
    async getUserMapValuesById(userId) {
        const userRecord = await this.searchUserById(userId);
        return this.getUserMapValues(userRecord);
    }

    /**
     * サブテーブル「貸出管理」を更新
     * @param {number} recordId - ユーザー台帳のレコードID
     * @param {number|undefined} revision - リビジョン（省略可）
     * @param {Array} rowsPayload - サブテーブルの行配列（{id?, value:{...}}）
     */
    async updateLendingSubtable(recordId, revision, rowsPayload) {
        if (!recordId) throw new Error('recordId is required');
        const body = {
            app: this.appId,
            id: recordId,
            record: {
                '貸出管理': { value: rowsPayload || [] }
            }
        };
        if (revision !== undefined && revision !== null) {
            body.revision = revision;
        }
        try {
            const resp = await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', body);
            return resp;
        } catch (error) {
            console.error('サブテーブル更新エラー:', error);
            throw error;
        }
    }
}

// グローバルに公開
window.UserListAPI = UserListAPI; 