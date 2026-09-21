export async function fetchUserName(userId: string) {
  const response = await fetch(`https://example.com/users/${userId}`);
  const user = await response.json();
  return user.profile.name.toUpperCase();
}
