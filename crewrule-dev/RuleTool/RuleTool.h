#ifndef RuleTool_H
#define RuleTool_H

#include <memory>
#include "../RuleEngine/RuleEngine.h"
#include "CrewDB.h"

// shared_ptr声明 兼容 vs2008 vs2013
//20200312 ain, 不再需要兼容2008
//#ifdef std::shared_ptr
#define SharedPtr std::shared_ptr
//#else
//#define SharedPtr std::tr1::shared_ptr
//#endif 

#define CHECK_ERROR(msg) if (ret != 0) {printf("%s\n", msg);}

enum OR_TYPE {
	PO, RO
};

class RuleTool {
public:
	//singleton
	static RuleTool& getInstance()
	{
		static RuleTool instance;    //init on first call
		return instance;
	}

	//PO分析：航班连接，输入scenarioId、连接时间参数
	int doPoAnalys(long long scenarioId, int minLTHours, int minLOHours);

	int reCalculateByFlight(long long scenarioId, string& flightIdStr, string filiale, string division);
	int reCalculateByFlightDate(long long scenarioId, string startDt, string endDt, string filiale, string division, long long ruleSetId = 0);
	int reCalculatePairingTag(long long scenarioId, string startDt, string endDt, string division); // ruleTool 计算pairing标签
	int reCalculateManday(long long scenarioId, string startDt, string endDt,string division);
	int reCalculateManday(long long scenarioId);
	int reCalculateMandayByPairing(long long scenarioId, string& pairingIdStr);
	int reCalculateMandayByCrew(long long scenarioId, string& crewIdStr, string startDt, string endDt, string division);
	int reRefreshDP(long long scenarioId, string startDt, string endDt, string division);
	int reCalculateDP();

	int reCalculateSeqOrder(long long scenarioId, string startDt, string endDt);

	int reCalculateRecency(long long scenarioId, string startDt, string endDt);
	int reCalculateRecency(long long scenarioId);

	bool saveScenarioToCsv(long long scenarioId);
	int changeScenarioStatus(long long scenarioId, char * status);

	int exportPairing(long long scenarioId, string type, int outputTmZone);
	int exportPairing(char* filepath, string type, int outputTmZone);
	int exportPairingMF(long long scenarioId, string type, int outputTmZone); //type=utc/loc
	int exportPairingMF(char* filepath, string type, int outputTmZone);
	int exportPairingZH(long long scenarioId, string utcOrLoc, int outputTmZone, string delim = " ");
	int exportPairingZH(char* filepath, string utcOrLoc, int outputTmZone, string delim = " ");
	int importPairing(long long scenarioId, string filename);
	int importPairingZH(long long scenarioId, string filename, string utcOrLoc, int outputTmZone);

	int mergeROScenarioGroup(long long scenarioId);

	int autoTest(string dir);

	int saveOr(char* filepath, OR_TYPE type);

	//int errorCode();

	void setDbConfig(string connStr, string user, string password);
	void setDebugMode(bool bMode) { _legality->setDebugMode(bMode); };
	//void setUsername(string username) { _username = username; }
	void setLoginUser(string username) { _loginUser = username; }
	void setServerAddr(string value);
private:
	RuleTool();
	RuleTool(RuleTool const&) = delete;       // Don't Implement.
	void operator=(RuleTool const&) = delete; // Don't implement
	void reCalculateMandayFD_updowns_expBlh();// OP#1951

	SharedPtr<LegalityChecker> _legality;
	SharedPtr<CrewDataContext> dbData;
	//SharedPtr<PairingDBContext> ctx;
	
	string dbUrl;
	string dbUser;
	string dbPassword;
	string connStr = "121.40.48.189:10000/orcl";

	string _serverAddr = "";
	//string _username = "";
	
	string _loginUser = "ROIS"; //default ROIS

	//string username = "crew_dev_07";
	//string password = "rois07";
	void loadDatabaseConnectionInfo();
	
	int reCalculateByFlight(vector<long long>& flightIds);
	int reCalculateByFlight(vector<long long>& flightIds, const vector<string>& filiales, const string& division);
};


#endif//RuleTool_H