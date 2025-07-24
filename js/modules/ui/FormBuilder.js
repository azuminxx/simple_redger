/**
 * フォーム作成クラス
 */
class FormBuilder {
    /**
     * 検索フォームを構築（動的フィールド対応）
     */
    async buildSearchForm(appId) {
        try {
            const fieldsMap = await CONFIG.getAllAppFields();
            const appConfig = CONFIG.apps[appId];
            const fields = fieldsMap[appId] || [];
            // ユーザーリスト由来のフィールドは検索フォームから除外
            const displayFields = CONFIG.getDisplayFields(appId, true);
            
            let formHTML = '<div class="search-form">';

            // displayFieldsで指定された順序でフィールドを処理
            displayFields.forEach(fieldCode => {
                // 統合キーは除外
                if (fieldCode !== CONFIG.integrationKey) {
                    // searchMenuフラグで表示制御
                    const columnConfig = CONFIG.integratedTableConfig.columns.find(col => col.fieldCode === fieldCode && col.appId == appId);
                    if (columnConfig && columnConfig.searchMenu === false) {
                        return; // 表示しない
                    }
                    const field = fields.find(f => f.code === fieldCode);
                    if (field) {
                        formHTML += this.createFieldInput(field, appConfig.name, appId);
                    } else {
                        console.warn(`${appConfig.name}にフィールド「${fieldCode}」が見つかりません`);
                    }
                }
            });

            formHTML += '</div>';

            return formHTML;
        } catch (error) {
            this.logError('検索フォーム構築', error);
            // エラー時は空のフォームを返す
            return '<p>検索フォームの構築に失敗しました。</p>';
        }
    }

    /**
     * エラーログを統一フォーマットで出力
     */
    logError(operation, error) {
        console.error(`❌ ${operation}エラー:`, error);
    }



    /**
     * 数値入力要素を作成
     */
    static createNumberInputElement(field, appId) {
        return DOMHelper.createElement('input', {
            type: 'number',
            id: `${field.code}-${appId}`,
            name: field.code,
            placeholder: field.placeholder
        });
    }

    /**
     * 日付入力要素を作成
     */
    static createDateInputElement(field, appId) {
        return DOMHelper.createElement('input', {
            type: 'date',
            id: `${field.code}-${appId}`,
            name: field.code,
            placeholder: field.placeholder
        });
    }

    /**
     * 日時入力要素を作成
     */
    static createDateTimeInputElement(field, appId) {
        return DOMHelper.createElement('input', {
            type: 'datetime-local',
            id: `${field.code}-${appId}`,
            name: field.code,
            placeholder: field.placeholder
        });
    }



    /**
     * フィールド入力要素のHTMLを生成
     */
    createFieldInput(field, appName, appId) {
        const fieldId = `${field.code}-${appId}`;
        let inputHTML = '';
        // required判定
        const columnConfig = CONFIG.integratedTableConfig.columns.find(col => col.fieldCode === field.code && col.appId == appId);
        const isRequired = columnConfig && columnConfig.required === true;

        inputHTML += `<div class="field-group">`;
        inputHTML += `<label for="${fieldId}">${field.label}:</label>`;

        if (field.type === 'dropdown' || field.type === 'radio') {
            // 複数選択可能なリストボックスに変更
            inputHTML += `<select id="${fieldId}" name="${field.code}" multiple size="5"${isRequired ? ' required' : ''}>`;
            if (field.options && field.options.length > 0) {
                field.options.forEach(option => {
                    const optionValue = option.label || option.value || option;
                    // 空の値やundefinedを除外
                    if (optionValue && optionValue.toString().trim() !== '') {
                        inputHTML += `<option value="${optionValue}">${optionValue}</option>`;
                    }
                });
            }
            inputHTML += `</select>`;
        } else if (field.type === 'checkbox') {
            inputHTML += `<div class="checkbox-group">`;
            
            if (field.options && field.options.length > 0) {
                field.options.forEach(option => {
                    const optionValue = option.label || option.value || option;
                    // 空の値やundefinedを除外
                    if (optionValue && optionValue.toString().trim() !== '') {
                        const checkboxId = `${fieldId}_${optionValue}`;
                        inputHTML += `
                            <label class="checkbox-label">
                                <input type="checkbox" id="${checkboxId}" name="${field.code}-${appId}" value="${optionValue}">
                                ${optionValue}
                            </label>
                        `;
                    }
                });
            }
            
            inputHTML += `</div>`;
        } else if (field.type === 'number') {
            inputHTML += `<input type="number" id="${fieldId}" name="${field.code}" placeholder="${field.label}を入力" autocomplete="off"${isRequired ? ' required' : ''}>`;
        } else if (field.type === 'date') {
            inputHTML += `<input type="date" id="${fieldId}" name="${field.code}" autocomplete="off"${isRequired ? ' required' : ''}>`;
        } else if (field.type === 'datetime-local') {
            inputHTML += `<input type="datetime-local" id="${fieldId}" name="${field.code}" autocomplete="off"${isRequired ? ' required' : ''}>`;
        } else {
            // text, textarea などのデフォルト
            inputHTML += `<input type="text" id="${fieldId}" name="${field.code}" placeholder="${field.label}を入力" autocomplete="off"${isRequired ? ' required' : ''}>`;
        }

        inputHTML += `</div>`;
        return inputHTML;
    }
}

// グローバルに公開
window.FormBuilder = FormBuilder;