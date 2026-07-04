h = open('/Users/saksham/BEAST/gym/gym.html','r').read()
s = h.index('<script>') + 8
e = h.index('</script>')
js = h[s:e]
open('/Users/saksham/BEAST/gym/gym.js','w').write(js)
print('JS extracted:', len(js), 'chars')
