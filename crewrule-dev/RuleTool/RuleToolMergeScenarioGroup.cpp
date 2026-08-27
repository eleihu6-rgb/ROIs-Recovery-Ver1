/**
说明:
1) 合并scenario_group RO计算结果到总计划场景
*/
#include <algorithm> 
#include <iostream>
#include <fstream>
#include "RuleTool.h"
#include "CrewDB.h"
#include "UtilFunc.h"
#include "TestDBFunc.h"

using namespace std;

void createRosterFlight(CrewDataContext* dbData);

int RuleTool::mergeROScenarioGroup(long long scenarioId) {
	//bool success = false;
	int ret = 0;
	time_t leadinStartUtc = 0, leadoutEndUtc = 0;
	vector<Pairing*> pairingOfScenario;
	string sid = "" + scenarioId;
	stringstream filename;
	ofstream f;
	//OCI_Resultset * rs = 0;
	char * sql = "select idscenario from scenario_group where idscenario_parent=:scenarioId";
	vector<long long> scenarioIdInGroup;
	Scenario scenario;
	int i = 0;

	//load scenario data from manday compute
	ret = this->dbData->loadData(scenarioId, this->_loginUser);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	_legality->setDataContext(dbData);
	///TEST
	cout << "----------------------------------------" << endl;
	cout << "load scenario " << scenarioId << endl;
	cout << "     crew " << dbData->crewList.size() << endl;
	cout << "     flight " << dbData->flightList.size() << endl;
	cout << "     pairing " << dbData->pairingIdMap.size() << endl;
	cout << "----------------------------------------" << endl;

	//load scenarioId in group
	ret = dbData->loadScenarioIdGroup(scenarioId, scenarioIdInGroup);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}

	//clear old data
	dbData->rosterList.clear();
	for (auto& crew : dbData->crewList) {
		crew->rosterList.clear();
		crew->mandayCcAmList.clear();
		crew->mandayFdList.clear();
	}

	//mantis#
	//load roster by scenario group
	scenario = dbData->scenario;
	leadinStartUtc = scenario.startDtUTC - 24 * 3600 * atoi(dbData->systemParamMap["DEFAULT_LEADIN_DAYS_PRIOR_ROSTER_PERIOD"].c_str());
	leadoutEndUtc = scenario.endDtUTC + 24 * 3600 - 1 + 24 * 3600 * atoi(dbData->systemParamMap["DEFAULT_LEADOUT_DAYS_POST_ROSTER_PERIOD"].c_str());
	printf("scenario dt: %s ~ %s  (%s ~ %s) (%s ~ %s)\n",
		utcToUtcDtString(leadinStartUtc).c_str(), utcToUtcDtString(leadoutEndUtc).c_str(),
		utcToUtcDtString(scenario.startDtUTC).c_str(), utcToUtcDtString(scenario.endDtUTC).c_str(),
		utcToUtcString(scenario.startDtUTC).c_str(), utcToUtcString(scenario.endDtUTC).c_str());

	//load pre-assign from 0
	dbData->loadRoster(scenarioIdInGroup, leadinStartUtc, leadoutEndUtc, dbData->crewList);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	printf("load %zd roster in group\n", dbData->rosterList.size());

	//统一 scenarioId, 避免save被过滤
	printf("reset roster.scenarioId...\n");
	for (auto& r : dbData->rosterList) {
		if (r->idscenario == 0)
			r->source = "PA";
		r->idscenario = scenarioId;
	}
	//同意rosterFlight scenarioId
	for (auto& crew : dbData->crewList) {
		for (auto& rf : dbData->rosterFlightMgr.get(crew->idCrew)) {
			rf->scenarioId = scenarioId;
		}
	}

	printf("make index crew(%zd) -> roster(%zd) ...\n", dbData->crewList.size(), dbData->rosterList.size());
	makeRosterCrewIndex(dbData->crewList, dbData->rosterList);

	printf("make index roster -> pairing ...\n");
	makePairingRosterIndex(dbData->rosterList, dbData->pairingList);

	for (std::size_t i = 0; i < dbData->rosterList.size(); i++) {
		dbData->mergeNewIdToOldId[-1L - i] = dbData->rosterList[i]->rosterId;
		dbData->rosterList[i]->rosterId = -1L - i; //set id < 0, server will save as new data
	}

	///TEST
	{
		///检查pairing roster匹配
		for (auto& crew : dbData->crewList) {
			for (auto& r : crew->rosterList) {
				if (r->pairId != 0 && r->pairing == NULL) {
					printf("ERROR: invalid data, roster.pairing is NULL for roster=%lld  pair_id=%lld\n", r->rosterId, r->pairId);
				}
			}
		}
		///检查pairing roster匹配
		for (auto& crew : dbData->crewList) {
			for (auto& r : crew->rosterList) {
				if (r->pairId != 0 && r->pairing == NULL) {
					printf("ERROR: invalid data, roster.pairing is NULL for roster=%lld  pair_id=%lld\n", r->rosterId, r->pairId);
				}
			}
		}
	}

	//mantis#1295, setDataContext中已经包含计算manday
	printf("re-calculate manday...\n");
	//_legality->setDataContext(this->dbData);

	for (auto& crew : this->dbData->crewList) {
		if (crew->division == "C")
			crew->mandayCcAmList = _legality->calculateMandayCC(this->dbData, crew, crew->rosterList);
		else
			crew->mandayFdList = _legality->calculateMandayFD(this->dbData, crew, crew->rosterList);
	}
	
	//20210729 ain, mantis#9412, ruletool merge流程增加逻辑生成 rosterFlt
	// 20240910 merge场景 rosterFlight中没有输出activeRank
	//printf("create rosterFlt...\n");
	//createRosterFlight(dbData.get());

	printf("save roster...\n");
	dbData->username = this->_loginUser;
	ret = dbData->saveRo();
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	
CLEANUP:
	if (ret != SUCCESS) {
		printf("ERROR merge fail (%d)\n", ret);
	}
	return ret;
}

//根据 roster+segment 生成 rosterFlt, 结果存入 dbData.rosterFlightMgr
void createRosterFlight(CrewDataContext* dbData) {
	if (!dbData) {
		return;
	}

	for (auto& it : dbData->crewIdMap) {
		string crewId = it.first;
		auto& crew = it.second;
		for (auto& r : crew->rosterList) {
			if (r->pairId == 0) {
				continue;
			}
			Pairing* pg = dbData->pairingIdMap[r->pairId];
			if (!pg) {
				cout << "ERROR: invalid data, pairing=" << r->pairId << " not found" << endl;
				// merge场景问题，原先数据可能没提供pairing导致rosterFlight缺，现逻辑，java提供rosterFlight，只针对没有pairing的
				if (dbData->mergeNewIdToOldId.find(r->rosterId) != dbData->mergeNewIdToOldId.end() && dbData->mergeRosterFlight.find(dbData->mergeNewIdToOldId[r->rosterId]) != dbData->mergeRosterFlight.end()) {
					auto rosterFlights = dbData->mergeRosterFlight[dbData->mergeNewIdToOldId[r->rosterId]];
					for (const auto & rf : rosterFlights) {
						rf->id = 0;
						rf->scenarioId = dbData->scenarioId;
						rf->rosterId = r->rosterId;
						dbData->rosterFlightMgr.add(rf);
					}
				}

				continue;
			}


			dbData->rosterFlightMgr.addByPairing(crewId, r->rosterId, dbData->scenarioId, pg, r->actingRank, r->position, r->source, "merge", "");
		}
	}
}
