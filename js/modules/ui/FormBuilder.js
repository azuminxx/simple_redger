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
            console.error('検索フォーム構築エラー:', error);
            // エラー時は空のフォームを返す
            return '<p>検索フォームの構築に失敗しました。</p>';
        }
    }

    /**
     * ドロップダウン要素を作成
     */
    static createDropdownElement(field, appId) {
        const inputElement = DOMHelper.createElement('select', {
            id: `${field.code}-${appId}`,
            name: field.code
        });

        if (field.options && Array.isArray(field.options)) {
            field.options.forEach(option => {
                const optionElement = DOMHelper.createElement('option', {
                    value: option
                });
                optionElement.textContent = option === '' ? '選択してください' : option;
                inputElement.appendChild(optionElement);
            });
        } else {
            // オプションが無い場合のフォールバック
            const defaultOption = DOMHelper.createElement('option', { value: '' });
            defaultOption.textContent = '選択してください';
            inputElement.appendChild(defaultOption);
        }

        return inputElement;
    }

    /**
     * チェックボックス要素を作成
     */
    static createCheckboxElement(field, appId) {
        const container = DOMHelper.createElement('div', {}, 'checkbox-container');
        
        if (field.options && Array.isArray(field.options)) {
            field.options.forEach((option, index) => {
                if (option === '') return; // 空の選択肢はスキップ
                
                const checkboxWrapper = DOMHelper.createElement('div', {}, 'checkbox-wrapper');
                
                const checkbox = DOMHelper.createElement('input', {
                    type: 'checkbox',
                    id: `${field.code}-${appId}-${index}`,
                    name: `${field.code}-${appId}`,
                    value: option
                });
                
                const label = DOMHelper.createElement('label');
                label.setAttribute('for', `${field.code}-${appId}-${index}`);
                label.textContent = option;
                
                checkboxWrapper.appendChild(checkbox);
                checkboxWrapper.appendChild(label);
                container.appendChild(checkboxWrapper);
            });
        }
        
        return container;
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
     * テキスト入力要素を作成
     */
    static createTextInputElement(field, appId) {
        return DOMHelper.createElement('input', {
            type: 'text',
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

        inputHTML += `<div class="field-group">`;
        inputHTML += `<label for="${fieldId}">${field.label}:</label>`;

        if (field.type === 'dropdown' || field.type === 'radio') {
            inputHTML += `<select id="${fieldId}" name="${field.code}">`;
            inputHTML += `<option value="">選択してください</option>`;
            
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
            inputHTML += `<input type="number" id="${fieldId}" name="${field.code}" placeholder="${field.label}を入力">`;
        } else if (field.type === 'date') {
            inputHTML += `<input type="date" id="${fieldId}" name="${field.code}">`;
        } else if (field.type === 'datetime-local') {
            inputHTML += `<input type="datetime-local" id="${fieldId}" name="${field.code}">`;
        } else {
            // text, textarea などのデフォルト
            inputHTML += `<input type="text" id="${fieldId}" name="${field.code}" placeholder="${field.label}を入力">`;
        }

        inputHTML += `</div>`;
        return inputHTML;
    }
}

// グローバルに公開
window.FormBuilder = FormBuilder; 