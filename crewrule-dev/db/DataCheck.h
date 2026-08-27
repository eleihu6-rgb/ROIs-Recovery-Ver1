#include <stdio.h>
#include <vector>

#include <sstream>
#include <time.h>
#include "CrewDB.h"
#include "CrewDBUtil.h"

#ifndef DATA_CHECK_H
#define DATA_CHECK_H

/*
//1、RO 需要检查是否每一 pairing.base\ duty.str_arp\ duty.end_arp\ seg.dep_arp\ seg.arv_arp都有值
//2、RO 是否存在Pairing缺少composition
//3、RO 检查location是否可获取（pair_id存在或location不为空）
*/
class DataCheck {
public:
	void init(vector<string>& baseList, vector<string>& fleetList, vector<string>& rankList, map<string, SharedPtr<ASSIGNMENT>>& assignmentNameMap);


	bool check(vector<Pairing*>& pairingList, vector<SharedPtr<ROSTER>>& rosterList);

	bool checkCrewRank(vector<SharedPtr<CREW>>& crewList);
	//bool checkCrewBase(PairingDBContext * ctx, string airline);
	bool checkIsPrimeBase(vector<SharedPtr<CREW>>& crewList);
	bool checkDutyEmpty(vector<Pairing*>& pairingList);
	bool checkDutyEmpty(Pairing* pairing);


	//bool checkPairingBySql(PairingDBContext * ctx, long long scenarioId);

	bool isWarningExists();
	vector<string>& getWarning();
	vector<string>& getErrorMsg();
	void printError();
private:
	bool checkPairing(vector<Pairing*>& pairingList);
	bool checkRoster(vector<SharedPtr<ROSTER>>& rosterList);
	bool checkPairingAboutFDP(vector<Pairing*>& pairingList);

	map<string, SharedPtr<ASSIGNMENT>> assignmentNameMap;
	vector<string> baseList;
	vector<string> fleetList;
	vector<string> rankList;
	vector<string> errorMsg;
	vector<string> warning;
};

#endif