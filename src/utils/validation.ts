export const isValidEmail = (email: string) => {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const isValidPhone = (phone: string) => {
  if (!phone) return false;
  return /^(0[3|5|7|8|9])+([0-9]{8})$/.test(phone);
};
