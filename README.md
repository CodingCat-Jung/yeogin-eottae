# 🌍 Travia

**Suggest global cities and schedules by filling the form, based on AI**  
> Fill a simple form to analyze your travel style, and then
> AI will suggest you where to travel and go.

---

## 🔨 Setup Project

### 0. Requirements

- Node.js 22 or higher
  - Run project via `npm` is not tested, please run `corepack enable` to enable other package managers except `npm`
- Git latest
- Text editor to modify `.env` file.

### 1. Clone repository

```bash
git clone https://github.com/GDGoC-SCHU/Travia_FE/
```

### 2. Install packages

- Install latest version of package manager:

```bash
yarn set version stable
```

- Install required packages:

```bash
yarn install
```

### 3. Write `.env` file

```env
VITE_BACKEND_ADDRESS=https://example.com
VITE_GOOGLE_API_KEY=your_api_key
```

* `https://example.com` : Includes protocol(`http` or `https`). Will formed like `https://example.com/api/`.
* `VITE_GOOGLE_API_KEY` : Needs to get static map image. Activate Maps Static API from Google Cloud Console, and get your API key.

[!WARNING]
> If you want to setup Travia_BE too, get your Gemini API key from Google AI Studio and apply to Travia_BE's `.env` file.
> Gemini key will not work in `.env` file here.

### 4. `yarn run dev` to test if it works.

---

## 🏷️ Commit type guides

| Type | Description           | Example                                  |
|------|----------------|---------------------------------------|
| feat | Added new feature | `feat: add result page`     |
| fix  | Fix a bug       | `fix: request infinitely`     |
| docs | Comments and documentation     | `docs: add OSS license to README` |

---

## 📌 Project Summary

**Travia** automatically suggests global cities
and **day-by-day schedule** by travel styles and period,
for users who plan a travel, using the AI(Gemini)

---

## 🧠 Technologies

| Part | Framework and Technologies |
|------|-----------|
| Frontend | **Tanstack Start + React**, TypeScript |
| Backend | **FastAPI**, **MySQL** |
| AI | **Gemini API (Google Generative AI)** |
| Others | JSON, Docker (containerize), managing environement variables, etc. |

---

## ✨ Key Features

- ✅ Simple form (Card UI + Icons)
- ✅ Suggests up to 3 global cities
- ✅ Automatically **generate day-by-day schedule by period**
- ✅ Card-formed result UI
- ✅ Web Application with responsive UI
- ✅ Develop with Docker container

---

## 📝 Survey Form

Users respond these entries by select or type.

| Entries | Description |
|------|------|
| Travelmate | without travelmate / friend / sweetheart / family |
| What to experience | heartful stories / lots of activities / delicious foods / cultural experience, etc. |
| Trip duration | example: 3 Nights, 4 Days. |
| Transportation | Drive a car / Take public transportation |
| Budget | Set your budget |
| Preffered temporature | Warm / Fresh / Snowy and Cold, etc. |
| Preffered Continent | Asia / Europe / America / Anywhere, etc. |
| Activity density per day | at your leisure / in moderation / active and busy |

---

## 💾 Example of Gemini Response Format (JSON)

```json
{
  "recommendations": [
    {
      "city": "Barcelona",
      "country": "Spain",
      "reason": "감성적이고 호주 여행하기 좋은 분위기, 따뜻한 기후와 맛집이 풍림",
      "schedule": {
        "day_1": [
          { "time": "10:00", "activity": "고딕 지구 산책" },
          { "time": "13:00", "activity": "보케리아 시장 타파스 점심" },
          { "time": "17:00", "activity": "카사 바트요 관람" }
        ],
        "day_2": [
          { "time": "10:00", "activity": "몬주익 언덕 트랭 타기" },
          { "time": "13:00", "activity": "현지 식당에서 점심" },
          { "time": "17:00", "activity": "바르셀로네타 해방 산책" }
        ],
        "day_3": [],
        "day_4": []
      }
    }
  ]
}
```

---

## 📄 Open Source License

### MIT License

[React](https://react.dev) | [Tanstack Start](https://tanstack.com/start/latest/docs/framework/react/overview) | [TailwindCSS](https://tailwindcss.com) | [shadcn UI](https://ui.shadcn.com/)

**React**

Copyright (c) Meta Platforms, Inc. and affiliates.

**Tanstack Start**

Copyright (c) 2021-present Tanner Linsley

**TailwindCSS**

Copyright (c) Tailwind Labs, Inc.

**shadcn UI**

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### ISC License

[Lucide Icons](https://lucide.dev/icons/)

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

### SIL OFL License

[학교안심 우주](https://copyright.keris.or.kr/idx) ([CDN](https://noonnu.cc/font_page/1223))

Copyright (c) 2023 KERIS, YoonDesign ([https://copyright.keris.or.kr/wft/fntDwnldView?fntGrpId=GFT202301120000000000006]).  


This Font Software is licensed under the SIL Open Font License, Version 1.1.  
This license is copied below, and is also available with a FAQ at:  
[https://openfontlicense.org]

\----------------------------------------------------------------------

#### SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

\----------------------------------------------------------------------

&nbsp;

PREAMBLE
-----------

The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
-----------

"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
-----------

Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
-----------

This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
-----------

THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.

