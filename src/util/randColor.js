export default () => {
  return `#${
    Math.floor(Math.random() * 105 + 150).toString(16).padStart(2, '0') +
    Math.floor(Math.random() * 105 + 150).toString(16).padStart(2, '0') +
    Math.floor(Math.random() * 105 + 150).toString(16).padStart(2, '0')}
  `;
}