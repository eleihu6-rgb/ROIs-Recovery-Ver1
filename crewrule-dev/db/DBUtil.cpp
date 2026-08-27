#include <stdio.h>
#include <vector>
#include <unordered_map>
#include <sstream>
#include <iostream>
#include <time.h>
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "UtilFunc.h"


using namespace std;

std::string parseCharArrayToString(const char* str) {
	std::string result = "";
	if (str != NULL)
		result = str;
	return result;
}



int calculatePairingPayTimeSecs(Pairing * pairing) {
	if (!pairing) {
		return 0;
	}
	int totalPayTime = 0;
	if (pairing->getNumDuties() > 0) {
		for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
			totalPayTime += pairing->getDuty(i)->getCreditInSec();
		}
	}
	return totalPayTime;//seconds 
}

//检查rosterId是否已经存在于rosterList中
bool isRosterOverlap(vector<SharedPtr<ROSTER>>& rosterList, SharedPtr<ROSTER>& roster, int &overlapIndexInRosterList) {
	for (std::size_t i = 0; i < rosterList.size(); i++) {
		if (rosterList[i]->strUtc < roster->endUtc && roster->strUtc < rosterList[i]->endUtc) {
			overlapIndexInRosterList = (int)i;
			return true;
		}
	}
	return false;
}

//检查crew是否已经出现在pairing对应各航班cof中
bool checkCofExist(Pairing * pairing, SharedPtr<CREW>& crew, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt) {

	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty * d = pairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment * s = d->getSegment(j);
			long long flt_id = s->getDBId();
			if (flt_id == 0) {
				continue; //mantis#5015, 忽略 flt_id=0
			}
			if (s->getAssignment() == "FLY" || s->getAssignment() == "OPR") {
				//cof中是否存在指定cof
				if (crewOnFlt.find(flt_id) != crewOnFlt.end()) {
					//检查是否重复
					for (std::size_t k = 0; k < crewOnFlt[flt_id].size(); k++) {
						if (crewOnFlt[flt_id][k]->crewId == crew->idCrew) {
							//cout << "WARN: crew=" << crew->idCrew << " is already on flt=" << flt_id << " for [pairing=" << pairing->getDbId() 
							//	<< "," << crewOnFlt[flt_id][k]->pairingId << "]" << endl;
							//20190314 ain, mantis#5064, COF数据错误不再抛出异常，仅打印日志并继续流程
							//Logger::getRuleLogger()->error(ss.str());
						}
					}
				}
			}
		}
	}
	return false;
}


void test_log_cof(unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt, long long fltId, const char* msg) {
	if (crewOnFlt.find(fltId) == crewOnFlt.end())
		return;
	cout << "COF[" << fltId << "] " << msg << " ";
	for (std::size_t i = 0; i < crewOnFlt[fltId].size(); i++) {
		cout << crewOnFlt[fltId][i]->crewId << "(" << crewOnFlt[fltId][i]->actingRank << ") ";
	}
	cout << endl;
}

