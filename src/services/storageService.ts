export class StorageService {
  public static async get<T>(key: string, defaultValue: T): Promise<T> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          chrome.storage.local.get([key], (result) => {
            if (result && result[key] !== undefined) {
              resolve(result[key] as T);
            } else {
              resolve(defaultValue);
            }
          });
        });
      } else if (typeof localStorage !== 'undefined') {
        const item = localStorage.getItem(key);
        if (item !== null) {
          return JSON.parse(item) as T;
        }
      }
    } catch (e) {
      console.warn('StorageService.get fallback:', e);
    }
    return defaultValue;
  }

  public static async set<T>(key: string, value: T): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          chrome.storage.local.set({ [key]: value }, () => resolve());
        });
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (e) {
      console.warn('StorageService.set error:', e);
    }
  }
}
