let userData = null;

export function setGlobalUserData(data) {
  userData = data;
}

export function getGlobalUserData() {
  return userData;
}