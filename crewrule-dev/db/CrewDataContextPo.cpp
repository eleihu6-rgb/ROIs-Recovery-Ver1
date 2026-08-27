#include <stdio.h>
#include <vector>
#include <algorithm>

#include <memory>
#include <iostream>
#include <fstream>
#include <time.h>

#include "JsonParser/JsonParser.h"
#include "JsonParser/SegmentJson.h"
#include "JsonParser/DBRuleJson.h"
#include "JsonParser/DBCqfJson.h"

#include "Pairing.h"
#include "Duty.h"
#include "Segment.h"
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "TestDBFunc.h"
#include "UtilFunc.h"
#include "OrLog.h"
#include "FlightAttribute.h"
#include "CustomBiz/CustomBiz.h"
#include "Log/Logger.h"

void setPairingFleetGrpBySegment(vector<Pairing*>& list, CrewDataContext* dbData);



int CrewDataContext::loadDataPO(long long scenarioId) {
	int ret = 0;
	bool success = false;
	//PairingDBContext* ctx = PairingDBContext::getDbConnection();

	this->scenarioId = scenarioId;

	if (strToUpper(trim(this->configDataSource)) == "DB") {
		Logger::getRuleLogger()->error("[loadDataPO] DataSource=DB not supported any more.");
	}
	else if (strToUpper(trim(this->configDataSource)) == "FILE") {
		ret = this->loadDataPoCsv("po_input.txt");
	}
	else {
		ret = this->loadDataPoFromHttpServer(scenarioId);
		if (ret != 0) {
			Logger::getRuleLogger()->error("ERROR: loadDataFromHttpServer fail {}", ret);
			goto CLEANUP;
		}
	}

CLEANUP:
	//release db connection
	//cleanupDBConnection(ctx);
	return ret;
}
int CrewDataContext::saveDataPO(vector<Pairing*>& pairingList, vector<Segment*> &imbalanceSegments) {
	int ret = 0;
	bool success = false;
	//PairingDBContext* ctx = PairingDBContext::getDbConnection();
	cout << utcToUtcString(time(0) + 8 * 3600) << " saveDataPO size=" << pairingList.size() << endl;
	//20180416 ain, mantis#3143, 补齐pairing.region
	for (Pairing* p : pairingList) {
		if (p->getRegion().empty())
			p->setRegion("_");
	}
	//20180508 ain, mantis#3302, 按duty中是否包含FLY赋值 duty.type, 含飞行航段时type=O; 仅有DHD/BUS航段时type=P
	//修正 segment.assignment = FLY/DHD
	for (Pairing* p : pairingList) {
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			bool foundFlySegment = false;
			bool containFlight = false;
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				if (s->getDBId() != 0) {
					containFlight = true;
				}
				if (s->getIsOperating() && s->getDBId() != 0) {
					s->setAssignment("FLY");
					foundFlySegment = true;
				}
				else if (s->getIsDeadhead() && s->getDBId() != 0) {
					s->setAssignment("DHD");
				}
			}
			if (containFlight) {
				d->setType(foundFlySegment ? Duty::DUTY_TYPE::DUTY_PURE_OPR : Duty::DUTY_TYPE::DUTY_POS_OWN);
			}
		}
	}
	//20181103 ain, mantis#4388, pairing.endArp
	for (Pairing* p : pairingList) {
		int size = (int)p->getNumDuties();
		p->setEndArp((size > 0) ? p->getDuty(size - 1)->getArrStation() : "");
	}
	//20181115 ain, OP#1950, savePO按seg.fleet汇总 pairing.fleetGrp
	setPairingFleetGrpBySegment(pairingList, this);
	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[saveDataPO] DataSource=DB not supported any more.");
	}
	else {
		ret = this->savePoCsv("po_output.txt", pairingList, imbalanceSegments);
		if (ret != 0) {
			Logger::getRuleLogger()->error("ERROR: savePoCsv fail {}", ret);
			goto CLEANUP;
		}
		ret = this->saveDataPoToHttpServer("po_output.txt");
		if (ret != 0) {
			Logger::getRuleLogger()->error("ERROR: saveDataToHttpServer fail {}", ret);
			goto CLEANUP;
		}
	}

CLEANUP:
	//release db connection
	//cleanupDBConnection(ctx);
	return ret;
}

//20181115 ain, OP#1950, 按seg汇总pairing.fleet, 以displayOrder最小为准
void setPairingFleetGrpBySegment(vector<Pairing*>& list, CrewDataContext* dbData) {
	string fleetOfMaxDisplayOrder = "";
	map<string, int> fleetPriorityMap;
	for (auto& fleet : dbData->fleetList) {
		fleetPriorityMap[fleet.fleet] = fleet.displayOrder;
		if (fleetOfMaxDisplayOrder == "" || fleetPriorityMap[fleetOfMaxDisplayOrder] < fleet.displayOrder)
			fleetOfMaxDisplayOrder = fleet.fleet;
	}

	for (Pairing* p : list) {
		int minFleetDisplayOrder = 999;
		string pairingFleet = fleetOfMaxDisplayOrder;//init to max
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				if (s->getAssignment() == "FLY") {
					string fleet = s->getFleetCD();
					if (fleetPriorityMap[fleet] < fleetPriorityMap[pairingFleet])
						pairingFleet = fleet;
				}
			}
		}
		p->setFltCode(pairingFleet);
	}
}
