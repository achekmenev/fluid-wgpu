export async function loadText(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.text();
    }
    catch (error) {
        console.error(`Failed to load text from ${url}:`, error);
        throw error;
    }
}
