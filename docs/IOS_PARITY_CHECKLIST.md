# iOS Checklist — Mobil Uygulama Özellik Envanteri

Bu dosya `mobile/` altındaki Flutter uygulamasının (şu ana kadar fiilen sadece Android'de
çalıştırılıp test edilmiş) **tüm mevcut özelliklerinin** dökümüdür. Uygulama zaten tek
kod tabanlı Flutter (iOS+Android) olarak yazıldı ve `mobile/ios/` iskeleti de mevcut —
yani "iOS'a taşımak" bir yeniden yazım değil, **her ekranı gerçek bir iPhone'da/simülatörde
tek tek gezip Android'deki davranışla birebir eşleştiğini doğrulamak** işi. Her satırı
iOS'ta test edip işaretle.

Kaynak: `mobile/lib/**` (2026-08-12 itibarıyla `master`).

---

## 0. Genel / Platform Altyapısı

- [ ] `mobile/ios/Runner/Info.plist` gözden geçirildi — `UIBackgroundModes: audio` ve `fetch` zaten tanımlı.
- [ ] `NSAppTransportSecurity → NSAllowsArbitraryLoads: true` zaten var (self-hosted HTTP sunuculara bağlanmak için gerekli).
- [ ] `NSLocalNetworkUsageDescription` zaten var.
- [ ] ⚠️ **Kontrol et:** Playlist kapak fotoğrafı yükleme (`image_picker`, galeri kaynağı) iOS'ta izin istiyor mu? Gerekirse `NSPhotoLibraryUsageDescription` / `NSPhotoLibraryAddUsageDescription` ekle — şu an Info.plist'te yok, `image_picker` sürümüne göre PHPicker kullanıyorsa gerekmeyebilir ama gerçek cihazda mutlaka test et.
- [ ] Uygulama ikonu / launch screen iOS'a özel asset'lerle (App Icon set, LaunchScreen storyboard) dolduruldu mu — şu an muhtemelen Flutter varsayılanı.
- [ ] Bundle identifier, signing team, provisioning profile ayarlandı (App Store Connect / TestFlight için).
- [ ] `flutter build ios` / gerçek cihazda `flutter run` sorunsuz derleniyor.
- [ ] Android'deki Impeller/OpenGL ES workaround'u (`android:value="opengles"`, GPU bellek sızıntısı fix'i) iOS'ta karşılığı yok — iOS'ta Impeller/Metal ile görsel bozulma / bellek sorunu var mı test et.
- [ ] Landscape + iPad boyutları: `Info.plist`'te iPad için 4 yön açık, iPhone için 3 yön (portrait yok upside-down). Tüm ekranlar bu yönlerde düzgün render oluyor mu.
- [ ] Dark tema (uygulama tamamen koyu tema — `theme.dart`) iOS sistem ayarlarıyla (Dynamic Type, Bold Text, vb.) çakışmıyor mu.
- [ ] iOS "sistem geri kaydırma" (edge-swipe-to-pop) hareketi, oynatıcı ekranının kendi swipe gesture'larıyla (aşağıda) çakışmıyor mu — özellikle Player ekranındaki yatay/dikey pan.

---

## 1. Giriş / Oturum (`login_screen.dart`, `auth_service.dart`)

- [ ] Sunucu URL + kullanıcı adı + şifre ile giriş formu, validasyon (boş alan kontrolü).
- [ ] Giriş sırasında Subsonic `ping` ile kimlik doğrulama; hata mesajı ekranda gösteriliyor.
- [ ] Opsiyonel: özel API üzerinden JWT token alma (`loginCustomApi`) — başarısız olsa da Subsonic auth ile devam edebiliyor.
- [ ] Kimlik bilgileri `shared_preferences` ile cihazda saklanıyor (URL, kullanıcı adı, şifre, token) — Keychain/iOS güvenli depolama davranışı doğrulandı mı (shared_preferences iOS'ta NSUserDefaults kullanır, hassas veri için ideal değil — bilinçli bir trade-off, en azından not edilmeli).
- [ ] Uygulama açılışında oturum otomatik yükleniyor, girişliyse doğrudan `/home`'a yönlendiriliyor.
- [ ] Çıkış yapma (`Settings` ekranından) kimlik bilgilerini temizliyor ve login ekranına dönüyor.

---

## 2. Genel Navigasyon (`app.dart`, `home_screen.dart`)

- [ ] Alt sekme çubuğu (bottom nav): Home, Artists, Search, Library, Settings.
- [ ] Aktif sekme, alt route'lara göre doğru highlight ediliyor (örn. `/favorites`, `/recent` gibi alt sayfalarda "Library" sekmesi aktif kalıyor).
- [ ] Mini player, alt nav'ın hemen üstünde her ekranda kalıcı olarak görünüyor (bir şarkı çalarken).
- [ ] go_router tabanlı deep-link/route yapısı: `/albums/:id`, `/artists/:id`, `/playlists/:id` gibi path parametreli sayfalar.
- [ ] Tam ekran Player (`/player`) ve Queue (`/queue`) sayfaları alt nav shell'inin **dışında**, modal gibi push ediliyor.
- [ ] iOS'a özgü: swipe-back (sağdan kaydırarak geri) tüm push edilen ekranlarda tutarlı çalışıyor mu (go_router + Cupertino geçiş animasyonları test edilmeli — şu an Material tema kullanılıyor, iOS'ta "native" hissi verip vermediği bir tasarım kararı).

---

## 3. Ana Sayfa (`home_page_screen.dart`)

- [ ] "$Yıl Wrapped" önizleme kartı → `/wrapped`'e yönlendiriyor.
- [ ] "Continue Listening" bölümü: son çalınan şarkı için "Jump back in" kartı (albümü çekip o şarkıdan devam ettiriyor).
- [ ] "Recently added" albüm satırı (yatay kaydırmalı, `/albums`'a "tümünü gör" linki).
- [ ] "Most Played" bölümü: en çok çalınan 10 şarkı + kullanıcının playlist'leri satırı.
- [ ] "Rediscover" bölümü: unutulmuş şarkı önerileri.
- [ ] Sağ üstte "Discover" (keşfet) ikonu → `/discover`.
- [ ] Tüm bölümler veri boşsa otomatik gizleniyor (örn. hiç çalma geçmişi yoksa "Continue Listening" hiç render olmuyor).

---

## 4. Kütüphane Hub'ı (`library_screen.dart`)

- [ ] Sabit sistem öğeleri: Albums, All Songs, Favourites, Recently Played, Most Played, Downloaded, Discover, Wrapped.
- [ ] Kullanıcının playlist'leri dinamik olarak listeye ekleniyor.
- [ ] Satırlara uzun basınca (long-press) "Pin/Unpin" menüsü açılıyor — iOS'ta long-press + haptic feedback davranışı Android'dekiyle tutarlı mı.
- [ ] Pinlenen öğeler ayrı bir bölümde üstte, aralarında ayraç (divider) ile gösteriliyor.
- [ ] Sağ üstte "+" ile yeni playlist oluşturma dialog'u.
- [ ] Bir öğeye tıklanınca sunucuya "library interaction" kaydı gönderiliyor (sidebar sıralaması bunu kullanıyor).

---

## 5. Albümler (`albums_screen.dart`, `album_detail_screen.dart`)

- [ ] Albümler ızgara (grid) görünümünde, 2 sütun, kapak + isim + sanatçı.
- [ ] Sıralama menüsü: Recently Added, Recently Played, Most Played, Starred, A–Z, By Artist, Random.
- [ ] Yüklenirken skeleton/placeholder grid gösteriliyor.
- [ ] Boş kütüphane durumunda "admin panelden kütüphane ekle" mesajı.
- [ ] Albüm detay: büyük kapak banner (SliverAppBar), albüm adı/sanatçı/yıl/track sayısı, "Play all" butonu.
- [ ] Track listesi numaralandırılmış (`showNumber`) olarak gösteriliyor.

---

## 6. Tüm Şarkılar (`all_songs_screen.dart`)

- [ ] Sayfalama (200'lük sayfalar), "Load more" butonu ile ek sayfa çekme.
- [ ] Her satırda albüm bilgisi ve "eklenme tarihi" (`addedAt`) gösteriliyor.

---

## 7. Sanatçılar (`artists_screen.dart`, `artist_detail_screen.dart`)

- [ ] Alfabetik index başlıklarıyla gruplanmış sanatçı listesi (A, B, C… section header'lar).
- [ ] Sanatçı satırında yuvarlak kapak, isim, albüm sayısı.
- [ ] Sanatçı detay: dairesel büyük kapak, isim, albüm sayısı.
- [ ] "Albums" / "Songs" sekme geçişi (chip tarzı toggle).
- [ ] Songs sekmesi tüm albümlerden şarkıları toplu (flatten) çekiyor, 5'li batch halinde (aşırı paralel istek atmayı önlemek için).
- [ ] Player ekranından "See all" linkiyle doğrudan Songs sekmesine (`?tab=songs`) açılabiliyor.

---

## 8. Arama (`search_screen.dart`)

- [ ] AppBar içinde gömülü arama kutusu, `onSubmitted` ile tetikleniyor (klavyeden "search" action).
- [ ] Sonuçlar Songs / Artists / Albums olarak bölümlere ayrılmış.
- [ ] Boş sorgu ve "sonuç yok" durumları ayrı ayrı ele alınıyor.
- [ ] Arama kutusunu temizleme (X) butonu.

---

## 9. Favoriler (`favorites_screen.dart`)

- [ ] Starred (yıldızlı) şarkı/albüm/sanatçı listesi, toplam sayaç.
- [ ] Albüm satırlarında doğrudan unstar (yıldızı kaldırma) aksiyonu.
- [ ] Boş durumda yönlendirici mesaj ("☆ işaretine dokun").

---

## 10. İndirmeler / Çevrimdışı (`downloads_screen.dart`, `download_service.dart`)

- [ ] İndirilen parçalar SQLite (`sqflite`) tabanlı yerel veritabanında tutuluyor.
- [ ] Dosyalar `ApplicationDocumentsDirectory/downloads/` altına iniyor — iOS'ta bu dizin App Store/TestFlight güncellemelerinde korunuyor mu, iCloud yedeğine dahil olup olmadığı (büyük müzik dosyaları iCloud yedeğini şişirebilir — `NSURLIsExcludedFromBackupKey` eklenmeli mi, değerlendirilmeli).
- [ ] İndirme ilerlemesi (progress callback), iptal (`CancelToken`) ve hata durumunda yarım dosyanın silinmesi.
- [ ] Dosya boyutu insan-okunur formatta gösteriliyor (KB/MB).
- [ ] Silme öncesi onay dialog'u.
- [ ] İndirilen bir şarkı çalınırken, sunucudan stream yerine yerel dosyadan (`Uri.file`) çalınıyor (`buildAudioSource`).
- [ ] Playlist'te "Download" butonuyla tüm parçaları toplu indirme.
- [ ] iOS'ta arka planda indirme (uygulama arka plana alındığında devam eder mi) — `dio` ile yapılan indirmeler Android'de foreground service üzerinden korunuyor, iOS'ta arka plan indirme davranışı test edilmeli (muhtemelen uygulama arka plana alınca durur — bilinçli sınırlama mı, dokümante edilmeli).

---

## 11. Son Çalınanlar / En Çok Çalınanlar / Discover (`recently_played_screen.dart`, `most_played_screen.dart`, `discover_screen.dart`)

- [ ] Her ikisi de yenileme (refresh) ikonu ile provider'ı invalidate ediyor.
- [ ] Discover: sunucu tarafı öneri motoru (Ollama tabanlı AI ya da Last.fm benzer-sanatçı verisi) — kaynak metni (`source == 'ollama'` ise "Generated with AI" notu) doğru gösteriliyor.
- [ ] Discover'daki öneriler her zaman kullanıcının **kendi kütüphanesinden** — CLAUDE.md kuralına uygun olarak hiçbir dış link/indirme kaynağı sunulmuyor (bunu ihlal eden bir şey eklenmemeli).

---

## 12. Playlist Detay (`playlist_detail_screen.dart`)

- [ ] Kapak fotoğrafı düzenleme: galeriden resim seçip (`image_picker`) sunucuya yükleme.
- [ ] İsim düzenleme (dialog).
- [ ] Açıklama (description/comment) düzenleme.
- [ ] Play / Download (tümünü indir) butonları.
- [ ] Sıralama modları: Custom order (drag&drop, `ReorderableListView`), Oldest first, Newest first (eklenme tarihine göre).
- [ ] Custom sırada sürükle-bırak ile yeniden sıralama, sunucuya `reorderPlaylistTracks` ile senkronize ediliyor.
- [ ] Playlist silme (onay dialog'lu).
- [ ] iOS'ta `ReorderableListView` sürükleme jestleri (uzun basıp sürükleme) native hissi test edilmeli — haptic feedback var mı.

---

## 13. Wrapped — Yıllık Özet (`wrapped_screen.dart`)

- [ ] Yıl seçici dropdown (son 5 yıl).
- [ ] Toplam çalma sayısı, toplam dinleme süresi (saat/dakika) istatistik kartları.
- [ ] En çok dinlenen track kartı, en çok dinlenen 5 sanatçı listesi (sıralı).
- [ ] Aylık dinleme grafiği (basit bar chart, `_MonthChart`, 12 ay).
- [ ] "Generate with Ollama" ile AI özet metni üretme (sunucuda Ollama yapılandırılmışsa) — hata durumunda mesaj gösteriliyor.
- [ ] Tüm top track'lerin sıralı listesi.
- [ ] Veri yoksa "no plays recorded" mesajı.

---

## 14. Ayarlar (`settings_screen.dart`)

- [ ] Hesap bilgisi kartı: kullanıcı adı, sunucu URL'i, avatar (baş harf).
- [ ] Transcoding tercihleri: format (Original/MP3/AAC/Opus/OGG) + bitrate (No limit/64–320 kbps) — mobil veri tasarrufu için.
- [ ] ListenBrainz kullanıcı token'ı kaydetme.
- [ ] Last.fm session key kaydetme.
- [ ] Admin ise "Admin panel" satırı görünüyor → `/admin`.
- [ ] Çıkış yap (Sign out) butonu.
- [ ] Kaydetme sonrası "Saved." / "Save failed." geri bildirimi.

---

## 15. Admin Paneli (`admin_screen.dart`) — sadece admin rolündeki kullanıcılar için

### Users sekmesi
- [ ] Kullanıcı listesi, kendi hesabın "(you)" etiketiyle işaretli.
- [ ] Yeni kullanıcı oluşturma (kullanıcı adı, şifre, rol: user/admin).
- [ ] Şifre değiştirme (satır içi).
- [ ] Rol değiştirme (user ↔ admin toggle).
- [ ] Kullanıcı silme (onaylı).
- [ ] Pull-to-refresh.

### Libraries sekmesi
- [ ] Müzik kütüphanesi (klasör) ekleme — isim + yol.
- [ ] Kütüphane tarama (Scan) tetikleme, tarama sırasında "Scanning…" durumu.
- [ ] Kütüphane kaldırma (track verisi sunucuda kalır, sadece kaynak kaldırılır — onaylı).

### Settings sekmesi
- [ ] Last.fm scrobbling: enable toggle, API key, shared secret.
- [ ] Öneri motoru (Recommendations): enable toggle, Ollama URL, Ollama model adı.
- [ ] "Tüm öneriler kendi kütüphanenden — hiçbir edinme linki gösterilmez" notu (CLAUDE.md ilke 2'ye referans).
- [ ] Bağış (donation) linki gösterme toggle'ı — nag-screen olmayan, sessiz link modeli (CLAUDE.md ilke 5).

---

## 16. Tam Ekran Player (`player_screen.dart`)

- [ ] Kapak sanatı + başlık/sanatçı/albüm bilgisi.
- [ ] Sanatçı adına tıklayınca sanatçı sayfasına gidiyor (`.go()` — aynı sayfa stack'te zaten varsa duplicate-key çakışmasını önlüyor).
- [ ] Lyrics (şarkı sözü) görünümüne geçiş — kapak yerine senkronize/senkronize-olmayan sözler (`lyrics_view.dart`), aktif satır otomatik kaydırma + highlight.
- [ ] Yıldızlama (favorite) ikonu, anlık optimistic update.
- [ ] Seek bar (pozisyon/süre gösterimi ile).
- [ ] Shuffle, önceki, play/pause (büyük merkez buton), sonraki, repeat (off→all→one döngüsü) kontrolleri.
- [ ] "3 saniyeden fazla çalınmışsa önceki tuşu başa sarar, değilse gerçekten önceki şarkıya gider" davranışı.
- [ ] **Yatay swipe** (kapak üzerinde): sonraki/önceki şarkıya geçiş, bir sonraki/önceki kapağın kenardan "peek" etmesi (drag ile canlı önizleme), eşik + hız tabanlı tetikleme, bırakınca yumuşak "spring back" animasyonu.
- [ ] **Dikey swipe (aşağı)**: ekranı kapatma (dismiss), sürükleme sırasında opaklık azalması, eşiği geçmezse geri toparlanma.
- [ ] "Up Next" bölümü (bir sonraki şarkı önizlemesi, tıklayınca atlıyor).
- [ ] "More from this album" bölümü (SongTile listesi, numaralı).
- [ ] "More from this artist" bölümü (8 ile sınırlı + "See all" linki).
- [ ] Queue ekranına geçiş ikonu (sağ üst).
- [ ] iOS'ta bu swipe jestleri sistemin kendi geri-kaydırma jestiyle (kenar swipe) çakışmıyor mu — özellikle sağa swipe ile "önceki şarkı" ile iOS'un sayfa geri jesti aynı bölgede tetiklenebilir, gerçek cihazda mutlaka test edilmeli.

---

## 17. Mini Player (`mini_player.dart`)

- [ ] Ekranın altında ince ilerleme çubuğu (progress bar).
- [ ] Kapak + başlık/sanatçı, tıklanınca tam ekran player'ı açıyor.
- [ ] Yatay swipe ile önceki/sonraki şarkı (sadece kapak+bilgi alanı hareket ediyor, transport butonları sabit kalıyor).
- [ ] Play/pause, önceki, sonraki butonları.
- [ ] Hiçbir şey çalmıyorsa tamamen gizleniyor (`SizedBox.shrink`).

---

## 18. Sıra / Queue (`queue_screen.dart`)

- [ ] "Now Playing" bölümü (mevcut şarkı, sürüklenemez/kaldırılamaz).
- [ ] "Next Up" bölümü: sürükle-bırak ile yeniden sıralama, sağa/sola swipe ile kaldırma.
- [ ] Bir şarkıya tıklayınca o noktadan çalmaya başlama (öncesindeki şarkılar sıradan düşüyor).
- [ ] "Clear" butonu ile tüm sırayı temizleme.
- [ ] Boş sıra durumunda mesaj.

---

## 19. Ortak Şarkı Satırı Davranışları (`song_tile.dart`)

- [ ] Sağa kaydırma (swipe) → "Add to queue" hızlı aksiyonu (mevcut çalan şarkıda devre dışı).
- [ ] Sola kaydırma → "Remove from queue" (sadece Queue ekranında aktif).
- [ ] "⋮" (overflow) menüsü: Add to queue, Add to playlist, Download, Star/Unstar, Go to album, Go to artist, Song info, (varsa) Remove from queue.
- [ ] Şu an çalan şarkı satırı highlight (renk + "graphic_eq" ikonu) ile vurgulanıyor.
- [ ] "Song info" dialogu: title, artist, album, süre, format, bitrate, play count.
- [ ] "Add to playlist" dialogu: mevcut playlist'ler listesi, seçilince ekleme.
- [ ] iOS'ta swipe-to-action jestleri (`flutter_slidable`) native iOS "swipe actions" hissini veriyor mu, VoiceOver ile erişilebilir mi.

---

## 20. Arka Plan Oynatma / Sistem Entegrasyonu (`audio_handler.dart`, `main.dart`)

- [ ] `audio_service` ile arka plan sesi + kilit ekranı / kontrol merkezi (Control Center) medya kontrolleri.
- [ ] iOS Kontrol Merkezi / Kilit Ekranı'nda: kapak resmi, başlık, sanatçı, albüm, play/pause, ileri/geri butonları doğru görünüyor mu (Android bildirimindeki `androidNotificationChannelId` vb. ayarların iOS karşılığı yok — iOS tarafı `audio_service` paketinin kendi native konfigürasyonuna bağlı, ek kurulum gerekip gerekmediği kontrol edilmeli).
- [ ] Kuyruk (queue) `just_audio`'nun `ConcatenatingAudioSource`'u ile yönetiliyor; shuffle/repeat native player seviyesinde.
- [ ] ReplayGain: track-gain dB değeri ses seviyesine (`_replayGainVolume`) çevrilip uygulanıyor — iOS'ta ses seviyesi davranışı Android ile tutarlı mı.
- [ ] Uygulama tamamen kapatılınca (`onTaskRemoved`) oynatma duruyor — iOS'ta "swipe up to kill app" davranışının bu callback'i tetikleyip tetiklemediği farklı olabilir, test edilmeli.
- [ ] Kulaklık çıkarma / Bluetooth bağlantı kesilmesi durumunda otomatik duraklama (audio_session/just_audio varsayılanı) — iOS'ta test edilmeli.
- [ ] Diğer uygulamalar (telefon çağrısı, Siri, başka medya app'i) ses çalarken "ducking"/interrupt davranışı iOS'ta doğru mu.
- [ ] CarPlay desteği **yok** — kapsam dışı, ama iOS kullanıcı beklentisi olabileceği için not düşülmeli.
- [ ] Siri/Shortcuts entegrasyonu **yok**.
- [ ] Bugün widget'ı / Lock Screen widget'ı (iOS 16+ Live Activities dahil) **yok** — ileri faz için değerlendirilebilir.

---

## 21. Kapsam Dışı / Bilinçli Olarak Yapılmayanlar (CLAUDE.md ilkeleri)

- [ ] Hiçbir ekranda YouTube/SoundCloud/Spotify gibi harici kaynaktan müzik indirme/kazıma **yok** — bu ilke iOS tarafında da korunmalı.
- [ ] Discover/öneri motoru sadece **isim** öneriyor, hiçbir edinme linki/kaynak sağlamıyor — iOS UI'da da bu davranış korunmalı.
- [ ] Telemetri/analytics SDK'sı yok (privacy-first) — iOS build'ine yanlışlıkla bir crash-reporting/analytics paketi eklenmemiş olmalı (App Store "Privacy Nutrition Label" formunu buna göre dolduracaksın).
- [ ] Bağış (donation) UI'ı sadece admin açtıysa görünüyor, nag-screen değil.

---

## Nasıl kullanılır

1. Bu dosyayı yukarıdan aşağı, gerçek bir iPhone (mümkünse fiziksel cihaz, simülatörde arka plan ses/kilit ekranı testleri güvenilir değildir) üzerinde tek tek işaretle.
2. Android'de çalışan ama iOS'ta farklı davranan / eksik olan her maddeyi bu dosyanın altına bir "Bulunan Farklar" bölümü açıp not et.
3. Native izin metinleri (`Info.plist`), imzalama ve App Store meta verileri ayrı bir "TestFlight / App Store hazırlığı" checklist'i gerektirir — bu dosya sadece **özellik paritesi** içindir.
