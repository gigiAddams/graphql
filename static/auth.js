async function login(usernameOrEmail, password) {
    const credentials = btoa(`${usernameOrEmail}:${password}`);
    const response = await fetch('https://((DOMAIN))/api/auth/signin', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
        }
    });

    if (!response.ok) {
        throw new Error('Invalid credentials');
    }

    const { token } = await response.json();
    localStorage.setItem('jwt', token);
}
