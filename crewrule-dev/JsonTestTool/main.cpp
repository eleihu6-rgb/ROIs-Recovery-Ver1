#include <algorithm>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

#include "ErrorCodeDef.h"
#include "FileDirUtil.h"
#include "RuleEngine.h"
#include "RuleEngineHandler.h"
#include "TimezoneUtils.h"
#include "configParam.h"
#include "db/JsonPairing.h"
#include "Log/Logger.h"
#include "UtilFunc.h"

using namespace std;
namespace fs = std::filesystem;

namespace {
const char kSessionName[] = "json_test";

void copyToBuf(char* dst, size_t dstSize, const std::string& value) {
    if (!dst || dstSize == 0) {
        return;
    }
    std::snprintf(dst, dstSize, "%s", value.c_str());
    dst[dstSize - 1] = '\0';
}

void trySetTimezoneDatabase(const string& rootDir) {
    const vector<fs::path> candidates = {
        fs::path(rootDir) / "tzdata",
        fs::path(rootDir) / ".." / "tzdata",
        fs::path(rootDir) / ".." / "orUtil" / "TimeZoneUtil" / "tzdata",
        fs::path(rootDir) / ".." / ".." / "tzdata",
    };
    for (const auto& p : candidates) {
        std::error_code ec;
        if (fs::exists(p, ec)) {
            TimezoneUtils::SetTimezoneDatabase(p.lexically_normal().generic_string());
            Logger::getRuleLogger()->info("Timezone database: {}", p.lexically_normal().generic_string());
            Logger::getRuleConsoleLogger()->info("Timezone database: {}", p.lexically_normal().generic_string());
            return;
        }
    }
    Logger::getRuleLogger()->warn("Timezone database not found under rootDir={}, will use default search paths", rootDir);
}

string defaultRosterDirFromArgv0(const char* argv0) {
    try {
        fs::path exePath = argv0 ? fs::path(argv0) : fs::path();
        if (exePath.empty()) {
            exePath = fs::current_path();
        } else {
            exePath = fs::absolute(exePath);
        }

        fs::path dir = exePath.has_filename() ? exePath.parent_path() : exePath;
        for (int i = 0; i < 12 && !dir.empty(); i++) {
            fs::path candidate = dir / "JsonTestTool" / "data" / "inbox" / "roster";
            if (fs::exists(candidate) || fs::exists(dir / "JsonTestTool" / "main.cpp")) {
                return candidate.generic_string();
            }
            dir = dir.parent_path();
        }
    } catch (...) {
    }
    return (fs::current_path() / "JsonTestTool" / "data" / "inbox" / "roster").generic_string();
}

string normalizePath(string path) {
    replace(path.begin(), path.end(), '\\', '/');
    while (!path.empty() && (path.back() == '/' || path.back() == '\\')) {
        path.pop_back();
    }
    return path;
}

pair<string, string> resolveRootAndRosterDir(const string& input) {
    string normalized = normalizePath(input);
    string lower = normalized;
    transform(lower.begin(), lower.end(), lower.begin(), ::tolower);

    const string rosterSuffix = "/inbox/roster";
    if (lower.size() >= rosterSuffix.size() &&
        lower.rfind(rosterSuffix) == lower.size() - rosterSuffix.size()) {
        string root = normalized.substr(0, normalized.size() - rosterSuffix.size());
        string normalizedRoot = normalizePath(root);
        if (normalizedRoot.empty()) {
            normalizedRoot = ".";
        }
        return {normalizedRoot, normalized};
    }
    string normalizedRoot = normalized.empty() ? "." : normalized;
    return {normalizedRoot, normalizedRoot + "/inbox/roster"};
}

void loadDbConfigIfPresent(const string& filename) {
    ifstream f(filename);
    if (!f) {
        return;
    }
    string conn;
    string user;
    string pwd;
    f >> conn >> user >> pwd;
    if (!conn.empty()) {
        copyToBuf(g_connStr, sizeof(g_connStr), conn);
    }
    if (!user.empty()) {
        copyToBuf(g_username, sizeof(g_username), user);
    }
    if (!pwd.empty()) {
        copyToBuf(g_password, sizeof(g_password), pwd);
    }
    Logger::getRuleLogger()->info("DB connection: {} {}", g_username, g_connStr);
}

string toLowerCopy(const string& value) {
    string lower = value;
    transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
    return lower;
}

bool endsWith(const string& value, const string& suffix) {
    return value.size() >= suffix.size() &&
           value.compare(value.size() - suffix.size(), suffix.size(), suffix) == 0;
}

bool isScenarioLoadFile(const string& lowerName) {
    return endsWith(lowerName, "loadscenario.data.txt") ||
           endsWith(lowerName, "export.data.txt");
}

bool isIgnoredInputFile(const string& lowerName) {
    return endsWith(lowerName, ".zip") ||
           endsWith(lowerName, ".bak") ||
           endsWith(lowerName, ".old") ||
           endsWith(lowerName, ".tmp");
}

SharedPtr<CrewDataContext> createFreshRuleSrvDataContext(const SharedPtr<CrewDataContext>& source) {
    SharedPtr<CrewDataContext> fresh(new CrewDataContext(CREW_APP_TYPE_RULESRV));
    if (source) {
        fresh->configDataSource = source->configDataSource;
        fresh->configDataSourceUrl = source->configDataSourceUrl;
    } else {
        fresh->configDataSource = g_dataSource;
        fresh->configDataSourceUrl = g_dataSourceServerUtl;
    }
    return fresh;
}

void logResult(const string& op, int ret, const ErrorContext& ctx) {
    if (ret == 0) {
        Logger::getRuleLogger()->info("[{}] success", op);
        Logger::getRuleConsoleLogger()->info("[{}] success", op);
        return;
    }
    string msg = ctx.errorMsgBuf;
    Logger::getRuleLogger()->error("[{}] failed, code={}, {}", op, ret, msg);
    Logger::getRuleConsoleLogger()->error("[{}] failed, code={}, {}", op, ret, msg);
}

void applyDebugCrewsFilterIfPresent(const string& rosterDir, const SharedPtr<CrewDataContext>& dbData) {
    const string path = (fs::path(rosterDir) / "DebugCrews").generic_string();
    if (!fs::exists(path)) {
        return;
    }

    rapidjson::Document document;
    vector<string> debugCrews;
    int ret = readFile_CrewIdList(path.c_str(), debugCrews, document);
    if (ret != 0 && ret != ERR_FILE_FAIL) {
        const char* msg = readFile_getLastErrMsg();
        Logger::getRuleLogger()->warn("DebugCrews read failed, {}, {}", path, msg ? msg : "");
        return;
    }
    if (debugCrews.empty()) {
        return;
    }

    map<string, bool> debugCrewIdMap;
    for (auto& crewId : debugCrews) {
        debugCrewIdMap[crewId] = true;
    }
    vector<SharedPtr<CREW>> dbgCrewList;
    for (const auto& crewId : debugCrews) {
        if (debugCrewIdMap.find(crewId) != debugCrewIdMap.end() &&
            dbData->crewIdMap.find(crewId) != dbData->crewIdMap.end()) {
            dbgCrewList.push_back(dbData->crewIdMap[crewId]);
        }
    }
    if (!dbgCrewList.empty()) {
        dbData->crewList = dbgCrewList;
        Logger::getRuleLogger()->info("DebugCrews applied, crew size={}", dbData->crewList.size());
        Logger::getRuleConsoleLogger()->info("DebugCrews applied, crew size={}", dbData->crewList.size());
    }
}

int loadScenarioFromCsv(const string& rosterDir,
                        const string& fileName,
                        SharedPtr<CrewDataContext>& dbData,
                        const SharedPtr<LegalityChecker>& ruleEngine) {
    string filepath = rosterDir + "/" + fileName;
    Logger::getRuleLogger()->info("Load scenario data from {}", filepath);
    Logger::getRuleConsoleLogger()->info("Load scenario data from {}", filepath);
    try {
        SharedPtr<CrewDataContext> freshDbData = createFreshRuleSrvDataContext(dbData);
        int ret = freshDbData->loadDataCsv(filepath.c_str());
        if (ret != SUCCESS) {
            Logger::getRuleLogger()->error("Load scenario failed: loadDataCsv returned {}", ret);
            return ret;
        }
        dbData = freshDbData;
        ruleEngine->setDataContext(dbData);
        applyDebugCrewsFilterIfPresent(rosterDir, dbData);
        return 0;
    } catch (const std::exception& ex) {
        Logger::getRuleLogger()->error("Load scenario failed: {}", ex.what());
        return -1;
    } catch (...) {
        Logger::getRuleLogger()->error("Load scenario failed: unknown exception");
        return -1;
    }
}

int runSingleFile(const string& rosterDir,
                  const string& fileName,
                  SharedPtr<CrewDataContext>& dbData,
                  const SharedPtr<LegalityChecker>& ruleEngine) {
    ErrorContext errCtx = {0};
    string lower = toLowerCopy(fileName);

    if (isIgnoredInputFile(lower)) {
        Logger::getRuleLogger()->info("Skip ignored file {}", fileName);
        Logger::getRuleConsoleLogger()->info("Skip ignored file {}", fileName);
        return 0;
    }

    auto invokeUpdateList = [&]() {
        dbData->reset();
        return rule_engine_update_list(&errCtx, kSessionName, dbData, ruleEngine, nullptr, fileName.c_str());
    };

    int ret = 0;
    if (isScenarioLoadFile(lower)) {
        return loadScenarioFromCsv(rosterDir, fileName, dbData, ruleEngine);
    } else if (lower.find("deleteroster") != string::npos ||
               lower.find("assignroster") != string::npos ||
               lower.find("addroster") != string::npos ||
               lower.find("moveroster") != string::npos ||
               lower.find("undoall") != string::npos ||
               lower.find("undostep") != string::npos ||
               lower.find("swaproster") != string::npos ||
               lower.find("makepairing") != string::npos ||
               lower.find("deletepairing") != string::npos ||
               lower.find("updatepairing") != string::npos ||
               lower.find("addsegtopairing") != string::npos ||
               lower.find("deletesegfrompairing") != string::npos ||
               lower.find("addferry") != string::npos ||
               lower.find("convertsegmentflyanddhd") != string::npos ||
               lower.find("batchsyncpairing") != string::npos ||
               lower.find("syncrulesrv") != string::npos ||
               lower.find("updateroster") != string::npos ||
               lower.find("splitpairing") != string::npos ||
               lower.find("splitpairingbyseg") != string::npos ||
               lower.find("rosterflight") != string::npos ||
               lower.find("addflight") != string::npos ||
               lower.find("updatetraining") != string::npos ||
               lower.find("mergepairing") != string::npos) {
        ret = invokeUpdateList();
        logResult("update_list", ret, errCtx);
    } else if (lower.find("updateflight") != string::npos) {
        dbData->reset();
        ret = rule_engine_update_filght(&errCtx, kSessionName, dbData, ruleEngine, nullptr, fileName.c_str());
        logResult("update_flight", ret, errCtx);
    } else if (lower.find("trypairingoncrew") != string::npos) {
        dbData->reset();
        ret = rule_engine_try_pairing_on_crew(&errCtx, kSessionName, dbData, ruleEngine, fileName.c_str());
        logResult("try_pairing_on_crew", ret, errCtx);
    } else if (lower.find("checkpairing") != string::npos) {
        dbData->reset();
        ret = rule_engine_check(&errCtx, kSessionName, dbData, ruleEngine, fileName.c_str(), kSessionName);
        logResult("check_pairing", ret, errCtx);
    } else if (lower.find("updateactivityid") != string::npos) {
        ret = invokeUpdateList();
        logResult("update_activity_id", ret, errCtx);
    } else if (lower.find("checkcrew") != string::npos) {
        dbData->reset();
        ret = rule_engine_check_crew(&errCtx, kSessionName, dbData, ruleEngine, fileName.c_str());
        logResult("check_crew", ret, errCtx);
    } else if (lower.find("updatecrew") != string::npos) {
        dbData->reset();
        ret = rule_engine_update_crew(&errCtx, kSessionName, dbData, ruleEngine, fileName.c_str());
        logResult("update_crew", ret, errCtx);
    } else if (lower.find("routeactualrest") != string::npos) {
        dbData->reset();
        ret = rule_engine_route_actual_rest(&errCtx, kSessionName, dbData, ruleEngine, nullptr, fileName.c_str());
        logResult("route_actual_rest", ret, errCtx);
    } else if (lower.find("crewentitlement") != string::npos) {
        dbData->reset();
        ret = rule_engine_crew_entitlement(&errCtx, kSessionName, dbData, ruleEngine, nullptr, fileName.c_str());
        logResult("crew_entitlement", ret, errCtx);
    } else if (lower.find("crewmanday") != string::npos) {
        dbData->reset();
        ret = rule_engine_crew_manday(&errCtx, kSessionName, dbData, ruleEngine, nullptr, fileName.c_str());
        logResult("crew_manday", ret, errCtx);
    } else if (lower.find("crewpreference") != string::npos) {
        dbData->reset();
        ret = rule_engine_crew_preference(&errCtx, kSessionName, dbData, ruleEngine, nullptr, fileName.c_str());
        logResult("crew_preference", ret, errCtx);
    } else {
        Logger::getRuleLogger()->warn("Skip unsupported file {}", fileName);
        Logger::getRuleConsoleLogger()->warn("Skip unsupported file {}", fileName);
    }
    return ret;
}
}  // namespace

int main(int argc, char** argv) {
    string inputDir = argc > 1 ? argv[1] : defaultRosterDirFromArgv0(argv[0]);
    auto [rootDir, rosterDir] = resolveRootAndRosterDir(inputDir);
    if (!fs::exists(rosterDir)) {
        cout << "Inbox folder not found: " << rosterDir << endl;
        return 1;
    }

    copyToBuf(g_rootDir, sizeof(g_rootDir), rootDir);
    trySetTimezoneDatabase(rootDir);
    loadDbConfigIfPresent("Database_connection.txt");

    SharedPtr<CrewDataContext> dbData(new CrewDataContext(CREW_APP_TYPE_RULESRV));
    dbData->configDataSource = g_dataSource;
    dbData->configDataSourceUrl = g_dataSourceServerUtl;

    SharedPtr<LegalityChecker> ruleEngine(new LegalityChecker());
    ruleEngine->setDataContext(dbData);

    vector<string> fileList = get_all_files_names_within_folder(rosterDir);
    sort(fileList.begin(), fileList.end(), [](const string& a, const string& b) { return a < b; });

    Logger::getRuleLogger()->info("Start JsonTestTool on {}", rosterDir);
    Logger::getRuleConsoleLogger()->info("Start JsonTestTool on {}", rosterDir);

    int lastRet = 0;
    for (const auto& name : fileList) {
        lastRet = runSingleFile(rosterDir, name, dbData, ruleEngine);
    }

    Logger::getRuleLogger()->info("JsonTestTool finished");
    Logger::getRuleConsoleLogger()->info("JsonTestTool finished");
    return lastRet;
}
