plugins {
    id("com.android.application")
}

val configuredWebAppUrl = providers.gradleProperty("webAppUrl").orNull
    ?: throw GradleException(
        "webAppUrl is required; package only an explicitly verified HTTPS candidate URL."
    )

require(configuredWebAppUrl.startsWith("https://")) {
    "webAppUrl must use HTTPS"
}

android {
    namespace = "cn.yunyoumap.liuzu.preview"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "cn.yunyoumap.liuzu.preview"
        minSdk = 26
        targetSdk = 35
        versionCode = 7
        versionName = "0.6.0-preview"
        buildConfigField("String", "WEB_APP_URL", "\"${configuredWebAppUrl.replace("\"", "\\\"")}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
