/*
CrewDataContext.cpp
1 读写数据接口封装
2 接口
  loadData
  saveManday
  saveRoster
  addRoster
  delRoster
  refreshRosterIndexOfCrew
  getAirportOffset
*/

#include <stdio.h>
#include <vector>
#include <algorithm>
#include <climits>
#include <memory>
#include <iostream>
#include <iomanip>
#include <fstream>
#include <time.h>
#include <cmath>
#include "Pairing.h"
#include "Duty.h"
#include "Segment.h"
#include "JsonPairing.h"
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "TestDBFunc.h"
#include "UtilFunc.h"
#include "StringUtil.h"
#include "OrLog.h"
#include "UtilDbg.h"

#include "DataCheck.h"
#include "AirportDefaultTmOffset.h"
#include "OrLog.h"
#include "PersistentDataSingleton.h"
#include "Log/Logger.h"
#include "Utility.h"
#include "TimezoneUtils.h"
#include "index/TmTrainingConfigIndex.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"
#include "index/TmPairingIndex.h"
#include "index/CrewRpRecencyIndex.h"

#include "DataError.h"
#include "DutyCode/DutyCodeAssignment.h"
#include "DutyCode/DutyCodeConfig.h"
#include "GroundAttrCalculator.h"

#include "RuleParams.h"

//#include "vld.h"

using namespace std;

#ifdef WIN32

#else
#define _snprintf snprintf
#endif

//#define PO_INPUT_FILE "po_input.txt"
//#define PO_OUTPUT_FILE "po_output.txt"
#define RO_INPUT_FILE "ro_input.txt"
#define RO_OUTPUT_FILE "ro_output.txt"
#define TO_INPUT_FILE "to_input.txt"
#define TO_OUTPUT_FILE "to_output.txt"
#define DELETE_BUF(pBuf) if (pBuf) { delete[] pBuf; pBuf = NULL;}

//static int LEADOUT_MVO_MVP_DAYS = 5;

void printDebugRosterPairing(const string title, const CrewDataContext * dbData) {
	stringstream ss;
	auto iterCrew = dbData->crewIdMap.find("761555");
	if (iterCrew != dbData->crewIdMap.end()) {
		auto& crew = iterCrew->second;
		ss << title << ":"
			<< "dbData(0x" << std::hex << std::setw(sizeof(void*) * 2) << std::setfill('0') << reinterpret_cast<uintptr_t>(dbData) << "): " << std::dec
			<< crew->idCrew << ", roster size:" << crew->rosterList.size() << ", ";
		for (auto& roster : crew->rosterList) {
			if (roster->pairing != nullptr) {
				ss << "pairingId(0x" << std::hex << std::setw(sizeof(void*) * 2) << std::setfill('0') << reinterpret_cast<uintptr_t>(roster->pairing) << "): " << std::dec
					<< roster->pairing->getDbId() << ", dutySize = " << roster->pairing->getDutyVec().size() << ";";
			}
		}
		ss << std::endl;
	}
	Logger::getRuleLogger()->debug(ss.str());
}

void debugEmptyCrew(const string title, const CrewDataContext* dbData) {
	auto iterCrew = dbData->crewIdMap.find("37122");
	if (iterCrew != dbData->crewIdMap.end()) {
		if (iterCrew->second == nullptr) {
			std::cout << "null" << std::endl;
		}
	}
}

//***************************************************************
//清理buf
//检查 objBuf中各个对象指针，是否存在与 usedMap中，若不在其中则释放
//***************************************************************
template<typename T>
void clearObjNotUsed(int objcount, T** objBuf, map<T*, T*>& usedMap) {
	for (int i = 0; i < objcount; i++) {
		T * obj = objBuf[i];
		if (usedMap.find(obj) == usedMap.end()) {
			delete objBuf[i];
			objBuf[i] = NULL;
		}
	}
}

static inline void updateDutyActivityId(Pairing* p, const vector<SharedPtr<UpdateActivityIdItem>>& updateDutyIdList) {
	vector<Duty*> dutyList = p->getDutyVec();
	for (auto& duty : dutyList) {
		for (auto& item : updateDutyIdList) {
			if (item->type == "DUTY" && item->oldId == duty->getDutyId()) {
				duty->setDutyId(item->newId);
				for (auto& node : duty->pairingDutyNodes) {
					node->setDutyId(item->newId);
				}
				for (auto& seg : duty->getSegments()) {
					seg->setDutyId(item->newId);
				}
			}
		}
	}
}

static inline void updateDutyActivityId(std::shared_ptr<CrewOnFlight>& cof, const vector<SharedPtr<UpdateActivityIdItem>>& updateDutyIdList) {
	for (auto& item : updateDutyIdList) {
		if (item->type == "DUTY" && item->oldId == cof->dutyId) {
			cof->dutyId = item->newId;
		}
	}
}

static inline void updateDutyActivityId(SharedPtr<RosterFlight>& rf, const vector<SharedPtr<UpdateActivityIdItem>>& updateDutyIdList) {
	for (auto& item : updateDutyIdList) {
		if (item->type == "DUTY" && item->oldId == rf->dutyId) {
			rf->dutyId = item->newId;
		}
	}
}

const set<long long>& Activity::getPhases() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		return _phaseIds_instance;
	}
	return _phaseIds.get();
}

void Activity::setPhases(const set<long long>& phaseIds) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		_phaseIds_instance = phaseIds;
	}
	else {
		_phaseIds.set(phaseIds);
	}
}

void Activity::clearPhases() {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		_phaseIds_instance.clear();
	}
	else {
		_phaseIds.get().clear();
	}
}

void Activity::appendPhase(const long long phaseId) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		_phaseIds_instance.insert(phaseId);
	}
	else {
		_phaseIds.get().insert(phaseId);
	}
}

void Activity::removePhase(const long long phaseId) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		_phaseIds_instance.erase(phaseId);
	}
	else {
		_phaseIds.get().erase(phaseId);
	}
}

void TmProgramCourseMoreLeg::makeAllLegStations(const CrewDataContext* dbData) {
	set<string> stations = dbData->tmTrainingConfigIndex->getCodesByCategory("FOOTPRINT_GROUP", this->legGroups);
	this->allLegStations.clear();
	this->allLegStations.insert(stations.begin(), stations.end());
	this->allLegStations.insert(this->legStations.begin(), this->legStations.end());
}

unordered_map<long long, std::vector<std::shared_ptr<DutyCodeLogic>>> makeDutyCodeLogicMap(const std::vector<std::shared_ptr<DutyCodeLogic>>& dutyCodeLogicList) {
	unordered_map<long long, vector<std::shared_ptr<DutyCodeLogic>>> index;

	for (const auto& dutyCodeLogic : dutyCodeLogicList) {
		long long compId = dutyCodeLogic->dutyCodeTypeCompId;
		if (index.find(compId) == index.end()) {
			index.insert({compId, {}});
		}
		index.at(compId).emplace_back(dutyCodeLogic);
	}

	return index;
}

//构造函数,
//applicationType: 指定用途为OR、RULE_SRV, 用以区分配置文件等逻辑
CrewDataContext::CrewDataContext(string applicationType) {
	init(applicationType);
	this->configInputLog = true; //default configInputLog=true
}

CrewDataContext::CrewDataContext(string applicationType, bool configInputLog) {
	init(applicationType);
	this->configInputLog = configInputLog;
}

//构造函数, 默认为针对OR
CrewDataContext::CrewDataContext() {
	init(CREW_APP_TYPE_OR);
	this->configInputLog = true; //default configInputLog=true
}

class TransactionDataUtils {
public:

	template<typename T>
	static vector<shared_ptr<T>> clone(const vector<shared_ptr<T>>& list) {
		vector<shared_ptr<T>> result;
		for (auto& item : list) {
			result.emplace_back(std::make_shared<T>(*item));
		}
		return result;
	}

	template<typename T>
	static vector<T*> clone(const vector<T*>& list) {
		vector<T*> result;
		for (auto& item : list) {
			result.emplace_back(new T(*item));
		}
		return result;
	}

	template<typename T>
	static std::list<shared_ptr<T>> clone(const std::list<shared_ptr<T>>& list) {
		std::list<shared_ptr<T>> result;
		for (auto& item : list) {
			result.emplace_back(std::make_shared<T>(*item));
		}
		return std::move(result);
	}

	template<typename T, typename S>
	static std::map<T, shared_ptr<S>> clone(const std::map<T, shared_ptr<S>>& _map) {
		std::map<T, shared_ptr<S>> result;
		for (const auto& pair : _map) {
			result[pair.first] = std::make_shared<S>(*(pair.second));
		}
		return result;
	}

	template<typename T, typename S>
	static std::unordered_map<T, shared_ptr<S>> clone(const std::unordered_map<T, shared_ptr<S>>& _map) {
		std::unordered_map<T, shared_ptr<S>> result;
		for (const auto& pair : _map) {
			result[pair.first] = std::make_shared<S>(*(pair.second));
		}
		return std::move(result);
	}

	template<typename T, typename S>
	static std::map<T, vector<SharedPtr<S>>> clone(const std::map<T, vector<SharedPtr<S>>>& _map) {
		std::map<T, vector<SharedPtr<S>>> result;
		for (const auto& pair : _map) {
			vector<SharedPtr<S>> list = clone(pair.second);
			result[pair.first] = list;
		}
		return result;
	}

	template<typename T, typename S>
	static std::unordered_map<T, vector<SharedPtr<S>>> clone(const std::unordered_map<T, vector<SharedPtr<S>>>& _map) {
		std::unordered_map<T, vector<SharedPtr<S>>> result;
		for (const auto& pair : _map) {
			vector<SharedPtr<S>> list = clone(pair.second);
			result[pair.first] = list;
		}
		return result;
	}

	static vector<SharedPtr<Voyage>> clone(const vector<SharedPtr<Voyage>>& list) {
		vector<SharedPtr<Voyage>> result;
		for (auto& item : list) {
			SharedPtr<Voyage> voyage = std::make_shared<Voyage>(*item);
			voyage->setDetails(clone(item->getDetails()));
			result.emplace_back(voyage);
		}
		return result;
	}

	static vector<Segment*> clone(const vector<Segment*>& list) {
		vector<Segment*> result;
		for (auto& seg : list) {
			//设置指针的成员变量， _preFerries、_nextFerries ,未使用 不需要深度复制 已处理
			Segment* newSeg = new Segment(*seg);
			newSeg->clear();
			result.emplace_back(newSeg);
		}
		return result;
	}

	static vector<Duty*> clone(const vector<Duty*>& list) {
		vector<Duty*> result;
		for (auto& duty : list) {
			//设置指针的成员变量，需要深度复制： _rule_limits（计算中设置，不需要复制）、pairingDutyNodes、_segments //TODO 需要深度复制 已处理
			Duty* newDuty = new Duty(*duty);
			//需要清除Duty中临时变量值 _rule_limits
			newDuty->clearLimitation();
			//复制Duty的Limitation
			copyDutyLimitation(duty, newDuty);

			auto segments = clone(duty->getSegments());
			newDuty->setSegments(segments);
			newDuty->pairingDutyNodes = clone(duty->pairingDutyNodes);
			result.emplace_back(newDuty);
		}
		return result;
	}

	static vector<Pairing*> clone(const vector<Pairing*>& list) {
		vector<Pairing*> result;
		for (auto& pairing : list) {
			vector<Duty*> newDutyVec = clone(pairing->getDutyVec());
			Pairing* newPairing = new Pairing(*pairing);
			newPairing->setDutyVec(newDutyVec);
			//需要清除Pairing中临时变量值 _segments、_flySegments、_mandayTimesFDP、_mandayTimesOther
			newPairing->clear();
			result.emplace_back(newPairing);
		}
		return result;
	}

	//static vector<DBRule> clone(const vector<DBRule>& list) {
	//	vector<DBRule> result;
	//	for (auto& item : list) {
	//		result.emplace_back(item);
	//		DBRule& dbRule = result.back();
	//		//见 parseRuleParams() 方法,按rule进行区分
	//		switch (dbRule.function) {
	//		case 2003: 
	//			dbRule.parsedParam = std::make_shared<rule2003>(*(static_pointer_cast<rule2003>(item.parsedParam)));
	//			break;
	//		case 2004:
	//			dbRule.parsedParam = std::make_shared<rule2004>(*(static_pointer_cast<rule2004>(item.parsedParam)));
	//			break;
	//		 .....

	//		}
	//	}
	//	return std::move(result);
	//}
	
	static vector<shared_ptr<ROSTER>> clone(const vector<shared_ptr<ROSTER>>& list, CrewDataContext& dbData) {
		vector<shared_ptr<ROSTER>> result;
		for (auto& item : list) {
			shared_ptr<ROSTER> roster = std::make_shared<ROSTER>(*item);
			if (item->pairing != nullptr) {
				roster->pairing = dbData.pairingIdMap[item->pairing->getDbId()];
			}
			roster->clear();
			//需要清除Duty中临时变量值 _rule_limits
			roster->clearLimitation();
			//复制Duty的Limitation
			copyRosterLimitation(item, roster);
			result.emplace_back(roster);
		}
		return result;
	}

	static vector<shared_ptr<CREW>> clone(const vector<shared_ptr<CREW>>& list, CrewDataContext& dbData) {
		vector<shared_ptr<CREW>> result;
		for (auto& item : list) {
			shared_ptr<CREW> crew = std::make_shared<CREW>(*item);
			crew->clear();
			crew->qualificationList = clone(item->qualificationList);
			crew->qualificationListInDb = clone(item->qualificationListInDb);
			unordered_map<string, SharedPtr<CREW_QUALIFICATION>> crewQualMap;
			for (auto& crewQual : crew->qualificationList) {
				crewQualMap[crewQual->qual] = crewQual;
			}

			for (auto& pair : item->qualListFiltedByRules) {
				crew->qualListFiltedByRules[pair.first] = crewQualMap[pair.first];
			}

			crew->fleetList = clone(item->fleetList);
			crew->rankList = clone(item->rankList);
			crew->companyRankList = clone(item->companyRankList);
			crew->baseList = clone(item->baseList);
			crew->mandayFdList = clone(item->mandayFdList);

			crew->publishedMandayFdList = clone(item->publishedMandayFdList);
			crew->crewFlyTogetherList = clone(item->crewFlyTogetherList);
			crew->crewFlyPreferenceList = clone(item->crewFlyPreferenceList);
			crew->mandayCcAmList = clone(item->mandayCcAmList);
			crew->publishedMandayCcAmList = clone(item->publishedMandayCcAmList);
			
			crew->preferenceList = clone(item->preferenceList);
            crew->crewRequestDetailList = clone(item->crewRequestDetailList);
            crew->crewRequestRecordDetailList = clone(item->crewRequestRecordDetailList);
			crew->statusList = clone(item->statusList);
			crew->teamList = clone(item->teamList);
			crew->entitlements = clone(item->entitlements);
			crew->profiles = clone(item->profiles);

			crew->rosterList.clear(); //TODO 在加载Roster后在赋值, 这里清空 已处理
			crew->guaranteeFlyHoursList = clone(item->guaranteeFlyHoursList);
			crew->guaranteeHourList = clone(item->guaranteeHourList);
			crew->avgAnnGuaranteeHourMap = item->avgAnnGuaranteeHourMap;
			//crew->index = std::make_shared<IndexCrewBaseRankFleet>(item->index); //TODO 需要深度复制 指针成员变量 dateIndexList, 已处理，通过调用 makeIndexCrewBaseRankFleet() 重新创建索引
			crew->crewBaseTimezoneOffsetIndex = std::make_shared<CrewBaseTimezoneIndex>(*(item->crewBaseTimezoneOffsetIndex));
			crew->crewKpiAdjustList = clone(item->crewKpiAdjustList);
			crew->crewKpiAdjustTimeIndex = std::make_shared<CrewKpiAdjustTimeIndex>(item->crewKpiAdjustList);
			result.emplace_back(crew);
		}
		return result;
	}

	static std::list<shared_ptr<CrewOnFlight>> clone(const std::list<shared_ptr<CrewOnFlight>>& list, CrewDataContext& dbData) {
		std::list<shared_ptr<CrewOnFlight>> result;
		for (auto& item : list) {
			shared_ptr<CrewOnFlight> crewOnFlight = std::make_shared<CrewOnFlight>(*item);
			crewOnFlight->crew = dbData.crewIdMap[crewOnFlight->crewId];
			result.emplace_back(crewOnFlight);
		}
		return result;
	}

	static std::vector<shared_ptr<CrewOnFlight>> clone(const std::vector<shared_ptr<CrewOnFlight>>& list, CrewDataContext& dbData) {
		std::vector<shared_ptr<CrewOnFlight>> result;
		for (auto& item : list) {
			shared_ptr<CrewOnFlight> crewOnFlight = std::make_shared<CrewOnFlight>(*item);
			crewOnFlight->crew = dbData.crewIdMap[crewOnFlight->crewId];
			result.emplace_back(crewOnFlight);
		}
		return result;
	}

	//static std::map<long long, Segment*> clone(const std::map<long long, Segment*>& _map) {
	//	std::map<long long, Segment*> result;
	//	for (const auto& pair : _map) {
	//		result[pair.first] = new Segment(pair.second);
	//	}
	//	return std::move(result);
	//}

	//static std::map<long long, Pairing*> clone(const std::map<long long, Pairing*>& _map) {
	//	std::map<long long, Pairing*> result;
	//	for (const auto& pair : _map) {
	//		result[pair.first] = pair.second == nullptr ? nullptr : new Pairing(pair.second->getDutyVec());
	//	}
	//	return std::move(result);
	//}

	static std::map<long long, TAG *> clone(const std::map<long long, TAG *>& _map, map<long long, vector<SharedPtr<TAG_GROUP>>>& tagGroupTableMap) {
		std::map<long long, SharedPtr<TAG_GROUP>> tagGroupMap;//<key:id, value:TAG_GROUP>
		for (auto& pair : tagGroupTableMap) {
			for (auto& tagGroup : pair.second) {
				tagGroupMap[tagGroup->id] = tagGroup;
			}
		}
		std::map<long long, TAG *> result;
		for (const auto& pair : _map) {
			TAG* tag = (pair.second == nullptr) ? nullptr : new TAG(*(pair.second));
			if (tag == nullptr) {
				continue;
			}
			tag->groups.clear();
			for (auto& tagGroup : pair.second->groups) {
				if (tagGroupMap.find(tagGroup->id) == tagGroupMap.end()) {
					tagGroupMap[tagGroup->id] = std::make_shared<TAG_GROUP>(*tagGroup);
				}
				tag->groups.push_back(tagGroupMap[tagGroup->id]);
			}
			result[pair.first] = tag;
		}
		return result;
	}

	static std::map<string, SharedPtr<Teaching>> clone(const std::map<string, SharedPtr<Teaching>>& _map) {
		std::map<string, SharedPtr<Teaching>> result;
		for (const auto& pair : _map) {
			SharedPtr<Teaching> teaching = std::make_shared<Teaching>(*(pair.second));
            auto teachDetails = teaching->getDetails();
            auto teachDetailsClone = clone(teachDetails);
			teaching->setDetails( teachDetailsClone );
			result[pair.first] = teaching;
		}
		return result;
	}

	static std::unordered_map<string, vector<shared_ptr<CrewRecency>>> clone(const std::unordered_map<string, vector<shared_ptr<CrewRecency>>>& _map) {
		std::unordered_map<string, vector<shared_ptr<CrewRecency>>> result;
		for (const auto& pair : _map) {
			result[pair.first] = clone(pair.second);
		}
		return result;
	}

	//static vector<Segment*> clone(const vector<Segment*>& list) {
	//	vector<Segment*> result;
	//	for (auto& item : list) {
	//		result.push_back(new Segment(*item));
	//	}
	//	return std::move(result);
	//}

	static std::map<long long, std::list<SharedPtr<CrewOnFlight>>> clone(const std::map<long long, std::list<SharedPtr<CrewOnFlight>>>& _map, CrewDataContext& dbData) {
		std::map<long long, std::list<SharedPtr<CrewOnFlight>>> result;
		for (const auto& pair : _map) {
			std::list<SharedPtr<CrewOnFlight>> list = clone(pair.second, dbData);
			result[pair.first] = list;
		}
		return result;
	}

	static std::unordered_map<long long, vector<SharedPtr<CrewOnFlight>>> clone(const std::unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& _map, CrewDataContext& dbData) {
		std::unordered_map<long long, vector<SharedPtr<CrewOnFlight>>> result;
		for (const auto& pair : _map) {
			vector<SharedPtr<CrewOnFlight>> list = clone(pair.second, dbData);
			result[pair.first] = list;
		}
		return result;
	}

private:
	static void copyDutyLimitation(const Duty* srcDuty, Duty* destDuty) {
		limitaions* limit =  srcDuty->getLimiation(RULE_LIMITATION_TYPE::MIN_REST);
		if (limit != nullptr) {
			destDuty->setLimitationValue(limit->type, limit->value, limit->last_set_rule, limit->ruleParamId, limit->overrideAbility, limit->classType, limit->description, limit->reference, false, limit->locked, limit->isFinalChecked);
		}


		limit = srcDuty->getLimiation(RULE_LIMITATION_TYPE::MAX_FDP);
		if (limit != nullptr) {
			destDuty->setLimitationValue(limit->type, limit->value, limit->last_set_rule, limit->ruleParamId, limit->overrideAbility, limit->classType, limit->description, limit->reference, false, limit->locked, limit->isFinalChecked);
		}

		limit = srcDuty->getLimiation(RULE_LIMITATION_TYPE::MAX_DP);
		if (limit != nullptr) {
			destDuty->setLimitationValue(limit->type, limit->value, limit->last_set_rule, limit->ruleParamId, limit->overrideAbility, limit->classType, limit->description, limit->reference, false, limit->locked, limit->isFinalChecked);
		}

		limit = srcDuty->getLimiation(RULE_LIMITATION_TYPE::MAX_BLOCK);
		if (limit != nullptr) {
			destDuty->setLimitationValue(limit->type, limit->value, limit->last_set_rule, limit->ruleParamId, limit->overrideAbility, limit->classType, limit->description, limit->reference, false, limit->locked, limit->isFinalChecked);
		}
	}

	static void copyRosterLimitation(const shared_ptr<ROSTER>& srcRoster, shared_ptr<ROSTER>& destRoster) {
		limitaions* limit = srcRoster->getLimiation(RULE_LIMITATION_TYPE::MIN_REST);
		if (limit != nullptr) {
			destRoster->setLimitationValue(limit->type, limit->value, limit->last_set_rule, limit->ruleParamId, limit->overrideAbility, limit->classType, limit->description, limit->reference, false, limit->locked, limit->isFinalChecked);
		}

		limit = srcRoster->getLimiation(RULE_LIMITATION_TYPE::MAX_FDP);
		if (limit != nullptr) {
			destRoster->setLimitationValue(limit->type, limit->value, limit->last_set_rule, limit->ruleParamId, limit->overrideAbility, limit->classType, limit->description, limit->reference, false, limit->locked, limit->isFinalChecked);
		}

		limit = srcRoster->getLimiation(RULE_LIMITATION_TYPE::MAX_DP);
		if (limit != nullptr) {
			destRoster->setLimitationValue(limit->type, limit->value, limit->last_set_rule, limit->ruleParamId, limit->overrideAbility, limit->classType, limit->description, limit->reference, false, limit->locked, limit->isFinalChecked);
		}

		limit = srcRoster->getLimiation(RULE_LIMITATION_TYPE::MAX_BLOCK);
		if (limit != nullptr) {
			destRoster->setLimitationValue(limit->type, limit->value, limit->last_set_rule, limit->ruleParamId, limit->overrideAbility, limit->classType, limit->description, limit->reference, false, limit->locked, limit->isFinalChecked);
		}
	}
};

void CrewDataContext::updateBaseData(const shared_ptr<CrewDataContext>& srcDbData, const shared_ptr<CrewDataContext>& destDbData, const string& changeType) {
	if (changeType == "UPDATE") {
		//包含更新和新增数据
		updateChangedBaseData(srcDbData, destDbData);
	}
	else if (changeType == "DELETE" || changeType == "DEL") {
		deleteChangedBaseData(srcDbData, destDbData);
	}
	else if (changeType == "UPDATEALL") {
		//update all
		updateAllBaseData(srcDbData, destDbData);
	}
	else {
		//update all
		updateAllBaseData(srcDbData, destDbData);
	}
}

//更新变更的静态数据（包括新增和修改）
void CrewDataContext::updateChangedBaseData(const shared_ptr<CrewDataContext>& srcDbData, const shared_ptr<CrewDataContext>& destDbData) {
	//TODO
}

//移除删除的静态数据
void CrewDataContext::deleteChangedBaseData(const shared_ptr<CrewDataContext>& srcDbData, const shared_ptr<CrewDataContext>& destDbData) {
	//TODO
}

//全量更新所有静态数据
void CrewDataContext::updateAllBaseData(const shared_ptr<CrewDataContext>& srcDbData, const shared_ptr<CrewDataContext>& destDbData) {
	destDbData->systemParamMap = srcDbData->systemParamMap;

	destDbData->baseList = srcDbData->baseList;

	destDbData->cqfList = srcDbData->cqfList;
	destDbData->cqfList2 = srcDbData->cqfList2; //为统一rule、cqf读取逻辑，过渡阶段增加以rule方式读取cqf

	destDbData->holidays = TransactionDataUtils::clone(srcDbData->holidays); //按airline和场景时间段筛选holiday //TODO 需要深度复制  已处理

	destDbData->airportList = srcDbData->airportList;
	//destDbData->airportCodeMap = srcDbData->airportCodeMap; //TODO 需要深度复制   已处理
	for (auto& airport : destDbData->airportList) {
		destDbData->airportCodeMap[airport.airport] = &airport;
	}
	destDbData->airportUtcOffsetMap = srcDbData->airportUtcOffsetMap; //机场的时区offset对应表，机场三字码 -> 时区分钟数，如北京8时区对应值为8*60=480
	destDbData->airportZoneIdMap = srcDbData->airportZoneIdMap; //机场的ZoneId对应表，机场三字码 -> ZoneId
	destDbData->airportDistanceMap = srcDbData->airportDistanceMap; //机场距离表

	destDbData->rankList = srcDbData->rankList;
	destDbData->rankMap = srcDbData->rankMap;

	destDbData->teamList = srcDbData->teamList;

	destDbData->rankToPositionMap = srcDbData->rankToPositionMap;

	destDbData->fleetList = srcDbData->fleetList;
	destDbData->fleetMap = srcDbData->fleetMap;
	destDbData->subFleetList = srcDbData->subFleetList;
	destDbData->subFleetMap = srcDbData->subFleetMap;

	destDbData->fatigueMap = srcDbData->fatigueMap;

	destDbData->pairingCompositionList = srcDbData->pairingCompositionList;

	destDbData->rosterPeriodList = srcDbData->rosterPeriodList;
	destDbData->guaranteeFlyHoursList = TransactionDataUtils::clone(srcDbData->guaranteeFlyHoursList); //TODO 需要深度复制  已处理

	destDbData->portQualReqmnts = srcDbData->portQualReqmnts;
	destDbData->portQualReqmntsAirportMap = srcDbData->portQualReqmntsAirportMap;

	destDbData->rankActingList = srcDbData->rankActingList;

	destDbData->totalAssignmentIdMap = TransactionDataUtils::clone(srcDbData->totalAssignmentIdMap); //包含所有assignment， 内容为map<assignment_id, assignment> //TODO 需要深度复制 已处理
	//destDbData->assignmentNameMap = TransactionDataUtils::clone(srcDbData->assignmentNameMap); //TODO 需要深度复制 已处理
	for (auto& pair : destDbData->totalAssignmentIdMap) {
		if (pair.second != NULL)
			destDbData->assignmentNameMap[pair.second->assignment] = pair.second;
	}
	//AssignmentHolder TODO 单实例数据，如何处理？？？？
	destDbData->liveConfigList = TransactionDataUtils::clone(srcDbData->liveConfigList); //需要深度复制
	destDbData->rulePhaseConfigMap = TransactionDataUtils::clone(srcDbData->rulePhaseConfigMap); //需要深度复制
	destDbData->ruleSetList = TransactionDataUtils::clone(srcDbData->ruleSetList); //需要深度复制
	destDbData->rule_8014 = TransactionDataUtils::clone(srcDbData->rule_8014); //TODO 需要深度复制 已处理

	destDbData->ruleList = srcDbData->ruleList;//法规规则明细 //TODO 需要深度复制, specialRulePortQualReqmnts 未使用不需要处理，dbRule.parsedParam 需要克隆 已处理
	parseRuleParams(destDbData->ruleList, destDbData->rule_8014);//处理dbRule.parsedParam
	std::sort(destDbData->ruleList.begin(), destDbData->ruleList.end(), DBRule::compare);

	destDbData->allRuleList = srcDbData->allRuleList;//法规规则明细 //TODO 需要深度复制
	std::sort(destDbData->allRuleList.begin(), destDbData->allRuleList.end(), DBRule::compare);

	destDbData->indexRule8014DutyGrp = srcDbData->indexRule8014DutyGrp;   //rule=8014 数据索引
	//destDbData->_ruleFuncMap = srcDbData->_ruleFuncMap; //为保证线程安全，不暴露为public  //TODO 需要深度复制 _ruleFuncMap 运行中计算，不需要处理
	//destDbData->_emptyFunc = srcDbData->_emptyFunc;  //TODO 需要深度复制, _emptyFunc 表示空，不需要处理
	destDbData->_ruleFuncList = srcDbData->_ruleFuncList; //法规规则ID列表

	destDbData->totalAssignGrps = srcDbData->totalAssignGrps;
	destDbData->assignmentNameGroupMap = srcDbData->assignmentNameGroupMap;
	PersistentDataSingleton::instance()->SetAssignmentGroupSetting(destDbData->assignmentNameGroupMap);

	destDbData->assignmentOverlappable = TransactionDataUtils::clone(srcDbData->assignmentOverlappable);  //TODO 需要深度复制 已处理
	//记录可以不检查休息的duty类型搭配
	//destDbData->assignmentMrtOveride = TransactionDataUtils::clone(srcDbData->assignmentMrtOveride); //TODO 需要深度复制 已处理
	for (std::size_t i = 0; i < destDbData->assignmentOverlappable.size(); i++) {
		SharedPtr<ASSIGNMENT_OVERLAPPABLE> obj = destDbData->assignmentOverlappable[i];
		if (obj->type == "MRT_OVERRIDE") {
			destDbData->assignmentMrtOveride.push_back(obj);
		}
		if (obj->type == "OVERLAPPABLE") {
			destDbData->assignmentOverlappableType.push_back(obj);
		}
	}
	destDbData->overlapableAssignmentMap = srcDbData->overlapableAssignmentMap;

	destDbData->compositionList = srcDbData->compositionList;           //comp_id
	destDbData->compositionLoadList = srcDbData->compositionLoadList;
	destDbData->compositionRankMap = srcDbData->compositionRankMap;//<compId, comp>
	destDbData->compositionRankOptionMap = srcDbData->compositionRankOptionMap;//<compId, comp> 3.0 适配多个option

	destDbData->crossRankRuleList = TransactionDataUtils::clone(srcDbData->crossRankRuleList); //TODO 需要深度复制 已处理 代码中未使用

	//Aircraft
	destDbData->fltIdToAircraftMap = TransactionDataUtils::clone(srcDbData->fltIdToAircraftMap); //TODO 需要深度复制 已处理

	destDbData->routeList = TransactionDataUtils::clone(srcDbData->routeList);            //OP#1901 //TODO 需要深度复制 已处理

	destDbData->routeRadiationConfigList = srcDbData->routeRadiationConfigList;

	//destDbData->csvPairingDutyNodeList = TransactionDataUtils::clone(srcDbData->csvPairingDutyNodeList); //TODO 需要深度复制 未使用

	destDbData->rankCombinationCriteriaMap = TransactionDataUtils::clone(srcDbData->rankCombinationCriteriaMap); //OP#1901 //TODO 需要深度复制 已处理

	destDbData->rankCombinationMap = TransactionDataUtils::clone(srcDbData->rankCombinationMap); //TODO 需要深度复制 已处理

	destDbData->rankCombIdToActingRankToNum = srcDbData->rankCombIdToActingRankToNum; //8091seqOrder列组成的最大配比

	destDbData->scenarioKpiMap = srcDbData->scenarioKpiMap; //优化参数

	destDbData->briefingNameMap = TransactionDataUtils::clone(srcDbData->briefingNameMap);  //TODO 需要深度复制 已处理

	destDbData->crewBases = TransactionDataUtils::clone(srcDbData->crewBases);  //TODO 需要深度复制 已处理

	destDbData->attributeIdMap = srcDbData->attributeIdMap;
	destDbData->attributeNameMap = srcDbData->attributeNameMap;

	destDbData->voyageList = TransactionDataUtils::clone(srcDbData->voyageList);  //TODO 需要深度复制，需要复制 VoyageDetail,已处理

	//map<string, vector<SharedPtr<Teaching>>> teachingOfStudent;                             //key: student_id, value: teachings
	destDbData->teachingOfStudent = TransactionDataUtils::clone(srcDbData->teachingOfStudent);  //TODO 需要深度复制，需要复制 TeachingDetail，已处理

	//CREW_TEAM_DATA                         crewTeam;  //数据接口： crewTeam.getTeamByCrew(string idcrew);

	destDbData->crewMonthMandayList = TransactionDataUtils::clone(srcDbData->crewMonthMandayList);

	destDbData->dictionaryList = TransactionDataUtils::clone(srcDbData->dictionaryList);
	destDbData->dictionaryMap.clear();
	destDbData->makeDictionaryMap();

	destDbData->tmTrainingConfigList = TransactionDataUtils::clone(srcDbData->tmTrainingConfigList);
	destDbData->tmTrainingConfigIndex = std::make_shared<TmTrainingConfigIndex>(destDbData->tmTrainingConfigList);

	destDbData->tmCourseList = TransactionDataUtils::clone(srcDbData->tmCourseList);
	destDbData->tmCourseMap.clear();
	destDbData->tmCourseCodeMap.clear();
	for (auto& tmCourse : destDbData->tmCourseList) {
		destDbData->tmCourseMap.insert(make_pair(tmCourse->id, tmCourse));
		destDbData->tmCourseCodeMap.insert(make_pair(tmCourse->courseCode, tmCourse));
	}

	destDbData->tmCourseBriefList = TransactionDataUtils::clone(srcDbData->tmCourseBriefList);
	destDbData->tmCourseBriefIndex = std::make_shared<TmCourseBriefIndex>(destDbData->tmCourseBriefList);

	destDbData->tmCourseDurationList = TransactionDataUtils::clone(srcDbData->tmCourseDurationList);
	destDbData->tmCourseDurationIndex = std::make_shared<TmCourseDurationIndex>(destDbData->tmCourseDurationList);

	destDbData->tmCourseRoleList = TransactionDataUtils::clone(srcDbData->tmCourseRoleList);
	destDbData->tmCourseRoleIndex = std::make_shared<TmCourseRoleIndex>(destDbData->tmCourseRoleList);

	destDbData->tmCourseRoleBaseList = TransactionDataUtils::clone(srcDbData->tmCourseRoleBaseList);
	destDbData->tmCourseRoleBaseIndex = std::make_shared<TmCourseRoleBaseIndex>(destDbData->tmCourseRoleBaseList);

	destDbData->tmCourseRoleQualList = TransactionDataUtils::clone(srcDbData->tmCourseRoleQualList);
	destDbData->tmCourseRoleQualIndex = std::make_shared<TmCourseRoleQualIndex>(destDbData->tmCourseRoleQualList);

	destDbData->tmCourseRoleDeviceList = TransactionDataUtils::clone(srcDbData->tmCourseRoleDeviceList);
	destDbData->tmCourseRoleDeviceIndex = std::make_shared<TmCourseRoleDeviceIndex>(destDbData->tmCourseRoleDeviceList);

	destDbData->tmFootprintList = TransactionDataUtils::clone(srcDbData->tmFootprintList);
	destDbData->tmFootprintIndex = std::make_shared<TmFootprintIndex>(destDbData->tmFootprintList);

	destDbData->tmFootprintCourseList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseList);
	destDbData->tmFootprintCourseIndex = std::make_shared<TmFootprintCourseIndex>(destDbData->tmFootprintCourseList);

	destDbData->tmFootprintCourseTraineeList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseTraineeList);
	destDbData->tmFootprintCourseTraineeIndex = std::make_shared<TmFootprintCourseTraineeIndex>(destDbData->tmFootprintCourseTraineeList);

	destDbData->tmFootprintCourseSectorList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseSectorList);
	destDbData->tmFootprintCourseSectorIndex = std::make_shared<TmFootprintCourseSectorIndex>(destDbData->tmFootprintCourseSectorList);

	destDbData->tmFootprintCourseIpRoleList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseIpRoleList);
	destDbData->tmFootprintCourseIpRoleIndex = std::make_shared<TmFootprintCourseIpRoleIndex>(destDbData->tmFootprintCourseIpRoleList);

	destDbData->tmFootprintCourseIpRoleBaseList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseIpRoleBaseList);
	destDbData->tmFootprintCourseIpRoleBaseIndex = std::make_shared<TmFootprintCourseIpRoleBaseIndex>(destDbData->tmFootprintCourseIpRoleBaseList);

	destDbData->tmFootprintCourseIpRoleQualList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseIpRoleQualList);
	destDbData->tmFootprintCourseIpRoleQualIndex = std::make_shared<TmFootprintCourseIpRoleQualIndex>(destDbData->tmFootprintCourseIpRoleQualList);

	destDbData->tmFootprintCourseRoleList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseRoleList);
	destDbData->tmFootprintCourseRoleIndex = std::make_shared<TmFootprintCourseRoleIndex>(destDbData->tmFootprintCourseRoleList);

	destDbData->tmFootprintCourseRoleQualList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseRoleQualList);
	destDbData->tmFootprintCourseRoleQualIndex = std::make_shared<TmFootprintCourseRoleQualIndex>(destDbData->tmFootprintCourseRoleQualList);

	destDbData->tmFootprintCourseRoleLimitationList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseRoleLimitationList);
	destDbData->tmFootprintCourseRoleLimitationIndex = std::make_shared<TmFootprintCourseRoleLimitationIndex>(destDbData->tmFootprintCourseRoleLimitationList);

	destDbData->tmProgramList = TransactionDataUtils::clone(srcDbData->tmProgramList);
	destDbData->tmProgramIndex = std::make_shared<TmProgramIndex>(destDbData->tmProgramList);

	destDbData->tmProgramBuddyList = TransactionDataUtils::clone(srcDbData->tmProgramBuddyList);
	destDbData->tmProgramBuddyIndex = std::make_shared<TmProgramBuddyIndex>(destDbData->tmProgramBuddyList);

	destDbData->tmProgramBuddyTimeList = TransactionDataUtils::clone(srcDbData->tmProgramBuddyTimeList);
	destDbData->tmProgramBuddyTimeIndex = std::make_shared<TmProgramBuddyTimeIndex>(destDbData->tmProgramBuddyTimeList);

	destDbData->tmProgramBuddyCourseList = TransactionDataUtils::clone(srcDbData->tmProgramBuddyCourseList);
	destDbData->tmProgramBuddyCourseIndex = std::make_shared<TmProgramBuddyCourseIndex>(destDbData->tmProgramBuddyCourseList);

	destDbData->tmProgramPipList = TransactionDataUtils::clone(srcDbData->tmProgramPipList);
	destDbData->tmProgramPipIndex = std::make_shared<TmProgramPipIndex>(destDbData->tmProgramPipList);

	destDbData->tmProgramCourseMap = TransactionDataUtils::clone(srcDbData->tmProgramCourseMap);
	destDbData->tmProgramCourseIndex = std::make_shared<TmProgramCourseIndex>(destDbData->tmProgramCourseMap);

	destDbData->tmProgramCourseInstructorMap = TransactionDataUtils::clone(srcDbData->tmProgramCourseInstructorMap);
	destDbData->tmProgramCourseInstructorIndex = std::make_shared<TmProgramCourseInstructorIndex>(destDbData->tmProgramCourseInstructorMap);

	destDbData->tmProgramCourseLimitationList = TransactionDataUtils::clone(srcDbData->tmProgramCourseLimitationList);
	destDbData->tmProgramCourseLimitationIndex = std::make_shared<TmProgramCourseLimitationIndex>(destDbData->tmProgramCourseLimitationList);

	destDbData->tmProgramCourseIpRelevanceList = TransactionDataUtils::clone(srcDbData->tmProgramCourseIpRelevanceList);
	destDbData->tmProgramCourseIpRelevanceIndex = std::make_shared<TmProgramCourseIpRelevanceIndex>(destDbData->tmProgramCourseIpRelevanceList);

	destDbData->tmProgramCourseRoleList = TransactionDataUtils::clone(srcDbData->tmProgramCourseRoleList);
	destDbData->tmProgramCourseRoleIndex = std::make_shared<TmProgramCourseRoleIndex>(destDbData->tmProgramCourseRoleList);

	destDbData->tmProgramCourseRoleQualList = TransactionDataUtils::clone(srcDbData->tmProgramCourseRoleQualList);
	destDbData->tmProgramCourseRoleQualIndex = std::make_shared<TmProgramCourseRoleQualIndex>(destDbData->tmProgramCourseRoleQualList);

	destDbData->tmProgramCourseRoleLimitationList = TransactionDataUtils::clone(srcDbData->tmProgramCourseRoleLimitationList);
	destDbData->tmProgramCourseRoleLimitationIndex = std::make_shared<TmProgramCourseRoleLimitationIndex>(destDbData->tmProgramCourseRoleLimitationList);

	destDbData->tmProgramCourseIpRoleList = TransactionDataUtils::clone(srcDbData->tmProgramCourseIpRoleList);
	destDbData->tmProgramCourseIpRoleIndex = std::make_shared<TmProgramCourseIpRoleIndex>(destDbData->tmProgramCourseIpRoleList);

	destDbData->tmProgramCourseIpRoleBaseList = TransactionDataUtils::clone(srcDbData->tmProgramCourseIpRoleBaseList);
	destDbData->tmProgramCourseIpRoleBaseIndex = std::make_shared<TmProgramCourseIpRoleBaseIndex>(destDbData->tmProgramCourseIpRoleBaseList);

	destDbData->tmProgramCourseIpRoleQualList = TransactionDataUtils::clone(srcDbData->tmProgramCourseIpRoleQualList);
	destDbData->tmProgramCourseIpRoleQualIndex = std::make_shared<TmProgramCourseIpRoleQualIndex>(destDbData->tmProgramCourseIpRoleQualList);

	destDbData->tmProgramCoursePnrList = TransactionDataUtils::clone(srcDbData->tmProgramCoursePnrList);
	destDbData->tmProgramCoursePnrIndex = std::make_shared<TmProgramCoursePnrIndex>(destDbData->tmProgramCoursePnrList);

	destDbData->tmProgramCourseIpckList = TransactionDataUtils::clone(srcDbData->tmProgramCourseIpckList);
	destDbData->tmProgramCourseIpckIndex = std::make_shared<TmProgramCourseIpckIndex>(destDbData->tmProgramCourseIpckList);

	destDbData->tmProgramCourseMoreList = TransactionDataUtils::clone(srcDbData->tmProgramCourseMoreList);
	destDbData->tmProgramCourseMoreIndex = std::make_shared<TmProgramCourseMoreIndex>(destDbData->tmProgramCourseMoreList);

	destDbData->tmProgramCourseMoreLegList = TransactionDataUtils::clone(srcDbData->tmProgramCourseMoreLegList);
	destDbData->tmProgramCourseMoreLegIndex = std::make_shared<TmProgramCourseMoreLegIndex>(destDbData->tmProgramCourseMoreLegList);

	destDbData->tmDeviceList = TransactionDataUtils::clone(srcDbData->tmDeviceList);
	destDbData->tmDeviceMap.clear();
	for (auto& tmDevice : destDbData->tmDeviceList) {
		destDbData->tmDeviceMap.insert(make_pair(tmDevice->resourceCode, tmDevice));
	}

	destDbData->tmDeviceTimeList = TransactionDataUtils::clone(srcDbData->tmDeviceTimeList);
	destDbData->tmDeviceTimeIndex = std::make_shared<TmDeviceTimeIndex>(destDbData->tmDeviceTimeList, destDbData.get());

	destDbData->tmPairingChartList = TransactionDataUtils::clone(srcDbData->tmPairingChartList);
	destDbData->tmPairingChartIndex = std::make_shared<TmPairingChartIndex>(destDbData->tmPairingChartList);

	destDbData->tmPairingChartRoleList = TransactionDataUtils::clone(srcDbData->tmPairingChartRoleList);
	destDbData->tmPairingChartRoleIndex = std::make_shared<TmPairingChartRoleIndex>(destDbData->tmPairingChartRoleList);

	destDbData->tmPairingChartRoleQualList = TransactionDataUtils::clone(srcDbData->tmPairingChartRoleQualList);
	destDbData->tmPairingChartRoleQualIndex = std::make_shared<TmPairingChartRoleQualIndex>(destDbData->tmPairingChartRoleQualList);

	destDbData->tmPairingChartCourseList = TransactionDataUtils::clone(srcDbData->tmPairingChartCourseList);
	destDbData->tmPairingChartCourseIndex = std::make_shared<TmPairingChartCourseIndex>(destDbData->tmPairingChartCourseList);

	//recencyMgr暂时不计入基础数据，假设永远不会更新
	//destDbData->recencyMgr.recencyMap = srcDbData->recencyMgr.recencyMap;
	//destDbData->recencyMgr.crewIndex = TransactionDataUtils::clone(srcDbData->recencyMgr.crewIndex); //TODO 需要深度复制
	//destDbData->recencyMgr._crewRecencyRules = TransactionDataUtils::clone(srcDbData->recencyMgr._crewRecencyRules);
	//destDbData->recencyMgr._crewFleetRecencyMap = TransactionDataUtils::clone(srcDbData->recencyMgr._crewFleetRecencyMap);
	//destDbData->recencyMgr._crewPortRecencyMap = TransactionDataUtils::clone(srcDbData->recencyMgr._crewPortRecencyMap);

	destDbData->crewRpRecencyList = TransactionDataUtils::clone(srcDbData->crewRpRecencyList);
	destDbData->crewRpRecencyIndex = std::make_shared<CrewRpRecencyIndex>(destDbData.get());

	destDbData->dutyCodeLogicList = TransactionDataUtils::clone(srcDbData->dutyCodeLogicList);
	destDbData->dutyCodeLogicMap = makeDutyCodeLogicMap(srcDbData->dutyCodeLogicList);
	destDbData->dutyCodeTypeCompList = TransactionDataUtils::clone(srcDbData->dutyCodeTypeCompList);

	
}

shared_ptr<CrewDataContext> CrewDataContext::createTransactionData(const shared_ptr<CrewDataContext>& crewDataContext) {
	shared_ptr<CrewDataContext> dbData = std::make_shared<CrewDataContext>(crewDataContext->getApplicationType());
	copyTransactionData(crewDataContext, dbData);
	return dbData;
}

//仅动态数据成员变量才深度复制，其他浅复制
void CrewDataContext::copyTransactionData(const shared_ptr<CrewDataContext>& srcDbData, const shared_ptr<CrewDataContext>& destDbData) {
	Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data start");
	long long lapsed = clock();

	//简便起见全部public
	destDbData->version = srcDbData->version;//20201021 区分版本2.0/3.0
	destDbData->loginDivision = srcDbData->loginDivision;//20201021 客户端登录division
	destDbData->divisionConstruction = srcDbData->divisionConstruction;//根据divisionContruction赋值配比
	destDbData->scenarioId = srcDbData->scenarioId;
	destDbData->leadinScenarioId = srcDbData->leadinScenarioId; //for PO
	destDbData->scenario = srcDbData->scenario;
	destDbData->startUtc = srcDbData->startUtc; //LOCAL 00:00 in UTC
	destDbData->endUtc = srcDbData->endUtc;   //LOCAL 23:59 in UTC
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 1");
	//回调函数实例
	destDbData->mandayForRosterCalculator = srcDbData->mandayForRosterCalculator;

	destDbData->username = srcDbData->username;  //mantis#3111, username for 'modifyBy' field of saving data
	destDbData->configDataSource = srcDbData->configDataSource;   //DB\Server
	destDbData->configDataSourceUrl = srcDbData->configDataSourceUrl; //server host

	destDbData->applicationType = srcDbData->applicationType;                                 //OR, RuleSrv
	destDbData->configInputLog = srcDbData->configInputLog;                                  //default=true, 是否记录input log: ro_input_rules.txt/ ro_input_pairing.txt ...
	//PairingDBContext                       *dbCtx;
	destDbData->httpAuthToken = srcDbData->httpAuthToken;
	//CsvEvaCrDefaultDutyTime

	destDbData->tempIdGenerator.store(srcDbData->tempIdGenerator);   //临时id生成器，	
	destDbData->CsvEvaCrDefaultDutyTimeMap = srcDbData->CsvEvaCrDefaultDutyTimeMap;
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 2");
	//步骤1：静态数据克隆
	destDbData->systemParamMap = srcDbData->systemParamMap;

	destDbData->baseList = srcDbData->baseList;

	destDbData->cqfList = srcDbData->cqfList;
	destDbData->cqfList2 = srcDbData->cqfList2; //为统一rule、cqf读取逻辑，过渡阶段增加以rule方式读取cqf

	destDbData->holidays = srcDbData->holidays; //按airline和场景时间段筛选holiday，采用浅复制

	destDbData->airportList = srcDbData->airportList;
	destDbData->airportCodeMap = srcDbData->airportCodeMap; //采用浅复制

	destDbData->airportUtcOffsetMap = srcDbData->airportUtcOffsetMap; //机场的时区offset对应表，机场三字码 -> 时区分钟数，如北京8时区对应值为8*60=480
	destDbData->airportZoneIdMap = srcDbData->airportZoneIdMap; //机场的ZoneId对应表，机场三字码 -> ZoneId
	destDbData->airportDistanceMap = srcDbData->airportDistanceMap; //机场距离表

	destDbData->rankList = srcDbData->rankList;
	destDbData->rankMap = srcDbData->rankMap;

	destDbData->teamList = srcDbData->teamList;

	destDbData->rankToPositionMap = srcDbData->rankToPositionMap;

	destDbData->pairingCompositionList = srcDbData->pairingCompositionList;

	destDbData->fleetList = srcDbData->fleetList;
	destDbData->fleetMap = srcDbData->fleetMap;
	destDbData->subFleetList = srcDbData->subFleetList;
	destDbData->subFleetMap = srcDbData->subFleetMap;

	destDbData->fatigueMap = srcDbData->fatigueMap;

	destDbData->rosterPeriodList = srcDbData->rosterPeriodList;
	destDbData->guaranteeFlyHoursList = srcDbData->guaranteeFlyHoursList; //采用浅复制

	destDbData->portQualReqmnts = srcDbData->portQualReqmnts;
	destDbData->portQualReqmntsAirportMap = srcDbData->portQualReqmntsAirportMap;

	destDbData->rankActingList = srcDbData->rankActingList;

	destDbData->totalAssignmentIdMap = srcDbData->totalAssignmentIdMap; //包含所有assignment， 内容为map<assignment_id, assignment> //采用浅复制
	destDbData->assignmentNameMap = srcDbData->assignmentNameMap; //采用浅复制
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 2.1");
	//AssignmentHolder TODO 单实例数据，如何处理？？？？
	destDbData->liveConfigList = srcDbData->liveConfigList; //采用浅复制
	destDbData->rulePhaseConfigMap = srcDbData->rulePhaseConfigMap; //采用浅复制
	destDbData->ruleSetList = srcDbData->ruleSetList; //采用浅复制
	destDbData->rule_8014 = srcDbData->rule_8014; //采用浅复制
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 2.1.1");
	destDbData->ruleList = srcDbData->ruleList;//法规规则明细 //采用浅复制, specialRulePortQualReqmnts 未使用不需要处理

	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 2.1.2");
	destDbData->allRuleList = srcDbData->allRuleList;//法规规则明细，采用浅复制
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 2.2");
	destDbData->indexRule8014DutyGrp = srcDbData->indexRule8014DutyGrp;   //rule=8014 数据索引
	//destDbData->_ruleFuncMap = srcDbData->_ruleFuncMap; //为保证线程安全，不暴露为public  //TODO 需要深度复制 _ruleFuncMap 运行中计算，不需要处理
	//destDbData->_emptyFunc = srcDbData->_emptyFunc;  //TODO 需要深度复制, _emptyFunc 表示空，不需要处理
	destDbData->_ruleFuncList = srcDbData->_ruleFuncList; //法规规则ID列表

	destDbData->totalAssignGrps = srcDbData->totalAssignGrps;
	destDbData->assignmentNameGroupMap = srcDbData->assignmentNameGroupMap;

	destDbData->assignmentOverlappable = srcDbData->assignmentOverlappable;  //采用浅复制
	//记录可以不检查休息的duty类型搭配
	destDbData->assignmentMrtOveride = srcDbData->assignmentMrtOveride;  //采用浅复制
	destDbData->assignmentOverlappableType = srcDbData->assignmentOverlappableType;
	destDbData->overlapableAssignmentMap = srcDbData->overlapableAssignmentMap;

	destDbData->compositionList = srcDbData->compositionList;           //comp_id
	destDbData->compositionLoadList = srcDbData->compositionLoadList;
	destDbData->compositionRankMap = srcDbData->compositionRankMap;//<compId, comp>
	destDbData->compositionRankOptionMap = srcDbData->compositionRankOptionMap;//<compId, comp> 3.0 适配多个option

	destDbData->crossRankRuleList = srcDbData->crossRankRuleList; //采用浅复制 代码中未使用
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 2.3");
	//Aircraft
	destDbData->fltIdToAircraftMap = TransactionDataUtils::clone(srcDbData->fltIdToAircraftMap); //需要深度复制 已处理

	destDbData->routeList = srcDbData->routeList;            //OP#1901 //采用浅复制

	destDbData->routeRadiationConfigList = srcDbData->routeRadiationConfigList;

	//destDbData->csvPairingDutyNodeList = TransactionDataUtils::clone(srcDbData->csvPairingDutyNodeList); //TODO 需要深度复制 未使用

	destDbData->rankCombinationCriteriaMap = srcDbData->rankCombinationCriteriaMap; //OP#1901 //采用浅复制

	destDbData->rankCombinationMap = srcDbData->rankCombinationMap; //采用浅复制

	destDbData->rankCombIdToActingRankToNum = srcDbData->rankCombIdToActingRankToNum; //8091seqOrder列组成的最大配比

	destDbData->scenarioKpiMap = srcDbData->scenarioKpiMap; //优化参数

	destDbData->briefingNameMap = srcDbData->briefingNameMap;  //采用浅复制

	destDbData->crewBases = srcDbData->crewBases;  //采用浅复制
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 2.4");
	destDbData->attributeIdMap = srcDbData->attributeIdMap;
	destDbData->attributeNameMap = srcDbData->attributeNameMap;

	destDbData->voyageList = srcDbData->voyageList;  //采用浅复制，需要复制 VoyageDetail,已处理

	//map<string, vector<SharedPtr<Teaching>>> teachingOfStudent;                             //key: student_id, value: teachings
	destDbData->teachingOfStudent = srcDbData->teachingOfStudent;  //采用浅复制，需要复制 TeachingDetail，已处理

	//CREW_TEAM_DATA                         crewTeam;  //数据接口： crewTeam.getTeamByCrew(string idcrew);

	//步骤2：航班相关克隆
	//destDbData->flightList = TransactionDataUtils::clone(srcDbData->flightList); //按 scenario.start/end/fleet/筛选航班 //TODO 需要深度复制 已处理
	//destDbData->flightIdMap.clear();
	////destDbData->flightIdMap = TransactionDataUtils::clone(srcDbData->flightIdMap); //TODO 需要深度复制 已处理
	//for (auto& flight : destDbData->flightList) {
	//	destDbData->flightIdMap[flight->getDBId()] = flight;
	//}
	destDbData->flightList = srcDbData->flightList;//改成浅复制，后续进行精确深度复制
	destDbData->flightIdMap = srcDbData->flightIdMap;//改成浅复制，后续进行精确深度复制
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 2.5");
	//flight对于pairing的索引 每次都需更新
	destDbData->flightIdToPairing = srcDbData->flightIdToPairing;
	destDbData->otherScenarioInSameGroup = srcDbData->otherScenarioInSameGroup;              //同组其他scenario id

	destDbData->resourceCtrlIdMap = srcDbData->resourceCtrlIdMap;  //map<cqfId, resourceCtrl<key, value>>, in which key=dtStr + ":" + base + ":" + rank + ":" + fleet + ":" + airport
	destDbData->resourceCtrlBaseBlh = srcDbData->resourceCtrlBaseBlh;

	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 3");
	//步骤3：Pairing、Duty和Segment相关克隆
	//destDbData->pairingList = TransactionDataUtils::clone(srcDbData->pairingList);  //pairing全集，包括场景条件筛选、预占 //TODO 需要深度复制， _segments、_flySegments、_mandayTimesFDP、_mandayTimesOther 不需要复制，复制包括：Pairing._dutyVec（Duty和Segment） 已处理
	//destDbData->pairingIdMap.clear();
	////destDbData->pairingIdMap = TransactionDataUtils::clone(srcDbData->pairingIdMap);  //key:pairing_id, value:pairing, for RO only  //TODO 需要深度复制 已处理
	//for (auto& p : destDbData->pairingList) {
	//	if (p == nullptr) {
	//		continue;
	//	}
	//	destDbData->pairingIdMap[p->getDbId()] = p;
	//}
	destDbData->pairingList = srcDbData->pairingList;//改成浅复制，后续进行精确深度复制
	destDbData->pairingIdMap = srcDbData->pairingIdMap;//改成浅复制，后续进行精确深度复制
	destDbData->pairingLabelMap = srcDbData->pairingLabelMap;//改成浅复制，后续进行精确深度复制

	destDbData->pairingListForRO.clear();
	//destDbData->pairingListForRO = TransactionDataUtils::clone(srcDbData->pairingListForRO);  //用于RO计算的 pairing，只包含来自 idscenario_pair的部分 //TODO 需要深度复制 已处理
	for (auto& pairingForRO : srcDbData->pairingListForRO) {
		destDbData->pairingListForRO.push_back(srcDbData->pairingIdMap[pairingForRO->getDbId()]);
	}

	destDbData->pairingListForROWithOpenComposition.clear();
	//destDbData->pairingListForROWithOpenComposition = TransactionDataUtils::clone(srcDbData->pairingListForROWithOpenComposition); //用于OR作为输入：指定rank还有剩余openComposition的pairing //TODO 需要深度复制 已处理
	for (auto& pairingForRO : srcDbData->pairingListForROWithOpenComposition) {
		destDbData->pairingListForROWithOpenComposition.push_back(srcDbData->pairingIdMap[pairingForRO->getDbId()]);
	}

	destDbData->preAssignPairingList.clear();
	//destDbData->preAssignPairingList = TransactionDataUtils::clone(srcDbData->preAssignPairingList);  //预占roster覆盖pairing //TODO 需要深度复制 已处理
	for (auto& preAssignPairing : srcDbData->preAssignPairingList) {
		destDbData->preAssignPairingList.push_back(srcDbData->pairingIdMap[preAssignPairing->getDbId()]);
	}

	destDbData->fltToPairingMap = srcDbData->fltToPairingMap;      //key:flt_id, value:pairing id list, for RO only
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 4");
	//步骤4：PO算法相关克隆
	//---------------- PO START -----------------  
	destDbData->pairingListBeforeRun.clear();
	//destDbData->pairingListBeforeRun = TransactionDataUtils::clone(srcDbData->pairingListBeforeRun); //TODO 需要深度复制   已处理
	for (auto& pairing : srcDbData->pairingListBeforeRun) {
		destDbData->pairingListBeforeRun.push_back(srcDbData->pairingIdMap[pairing->getDbId()]);
	}
	stable_sort(destDbData->pairingListBeforeRun.begin(), destDbData->pairingListBeforeRun.end(), [](Pairing* a, Pairing* b) -> bool {
		return a->getDbId() > b->getDbId();
		});

	destDbData->pairingListLeadin.clear();
	//destDbData->pairingListLeadin = TransactionDataUtils::clone(srcDbData->pairingListLeadin); //TODO 需要深度复制   已处理
	for (auto& pairing : srcDbData->pairingListLeadin) {
		destDbData->pairingListLeadin.push_back(srcDbData->pairingIdMap[pairing->getDbId()]);
	}

	destDbData->pairingInputFlights = srcDbData->pairingInputFlights;

	destDbData->pairingInputFerrys = TransactionDataUtils::clone(srcDbData->pairingInputFerrys); //TODO 需要深度复制  已处理
	//pairingInputFerrys loadCsvFlightCommute()
	destDbData->ferryFltIdMap.clear();
	//destDbData->ferryFltIdMap = TransactionDataUtils::clone(srcDbData->ferryFltIdMap); //TODO 需要深度复制  已处理
	for (auto& seg : srcDbData->pairingInputFerrys) {
		destDbData->ferryFltIdMap[seg->getDBId()] = seg;
	}

	destDbData->leadinOccupy = srcDbData->leadinOccupy;       //leadin中每个base占用的 composition占用小时总数，如某PEK的pairing配比1CA 1FO 下属一个flt blk=2h，则map<'PEK',(1+1)x2>
	destDbData->leadinPairings.clear();
	//destDbData->leadinPairings = TransactionDataUtils::clone(srcDbData->leadinPairings); //TODO 需要深度复制  已处理
	for (auto& pairing : srcDbData->leadinPairings) {
		destDbData->leadinPairings.push_back(srcDbData->pairingIdMap[pairing->getDbId()]);
	}

	destDbData->dutyLimitPerDay = srcDbData->dutyLimitPerDay;      //key=base, value=该base从场景第[0]天开始每一天duty上限，若场景包含法规2029则为减去该日leadin duty数之后结果
	destDbData->attributeNames = srcDbData->attributeNames;      //保存所有attribute名称
	destDbData->optimizationNecessity = TransactionDataUtils::clone(srcDbData->optimizationNecessity); //保存对应航空公司的必要法规 //TODO 需要深度复制 已处理

	//destDbData->originalFlightComposition = srcDbData->originalFlightComposition;

	destDbData->bidSequenceGroups = srcDbData->bidSequenceGroups; //潜复制
	destDbData->biddingResults = srcDbData->biddingResults; //潜复制

	destDbData->qualExtensionConfigList = srcDbData->qualExtensionConfigList; //RO使用，潜复制
	destDbData->qualExtensionConfigMap = srcDbData->qualExtensionConfigMap; //RO使用，潜复制

	//---------------- PO END -----------------

	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 5");
	//步骤5：处理CREW和COF CREW相关克隆
	//destDbData->crewTotalList = TransactionDataUtils::clone(srcDbData->crewTotalList, *destDbData); //所有crew 包括cof //TODO 需要深度复制， 需要复制内部segment 已处理
	//destDbData->crewIdMap.clear();
	////destDbData->crewIdMap = TransactionDataUtils::clone(srcDbData->crewIdMap); //map<idcrew, crew>以便动态查找crew数据，value来自 crewTotalList //TODO 需要深度复制 已处理
	//for (auto& crew : destDbData->crewTotalList) {
	//	destDbData->crewIdMap[crew->idCrew] = crew;
	//}
	destDbData->crewTotalList = srcDbData->crewTotalList;//改成浅复制，后续进行精确深度复制
	destDbData->crewIdMap = srcDbData->crewIdMap;//改成浅复制，后续进行精确深度复制

	//destDbData->crewList.clear();
	////destDbData->crewList = TransactionDataUtils::clone(srcDbData->crewList);  //TODO 需要深度复制， 已处理
	//for (auto& crew : srcDbData->crewList) {
	//	destDbData->crewList.push_back(destDbData->crewIdMap[crew->idCrew]);
	//}
	//makeIndexCrewBaseRankFleet(destDbData.get()); //创建 crew->index  索引

	//makeIndexCrewKpiAdjust(destDbData.get());//创建 crewKpiAdjust->index  索引
	destDbData->crewList = srcDbData->crewList;//改成浅复制，后续进行精确深度复制
	//makeIndexCrewBaseRankFleet();//改成浅复制，后续进行精确深度复制
	//makeIndexCrewKpiAdjust();//改成浅复制，后续进行精确深度复制


	//destDbData->crewOnPairing = TransactionDataUtils::clone(srcDbData->crewOnPairing, *destDbData); // key:pairingId, value:crewId list //TODO 需要深度复制, CrewOnFlight.Crew需要处理 已处理
	destDbData->crewOnPairing = srcDbData->crewOnPairing;//改成浅复制，后续进行精确深度复制
	//multimap<long long, string> crewOnPairing; // key:pairingId, value:crewId list

	//destDbData->crewOnFlt = TransactionDataUtils::clone(srcDbData->crewOnFlt, *destDbData); //TODO 需要深度复制 已处理
	destDbData->crewOnFlt = srcDbData->crewOnFlt; //改成浅复制，后续进行精确深度复制
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 6");
	//步骤6：处理Roster相关克隆
	//destDbData->rosterList = TransactionDataUtils::clone(srcDbData->rosterList, *destDbData);//TODO 需要深度复制， 已处理
	destDbData->rosterList = srcDbData->rosterList;//改成浅复制，后续进行精确深度复制, crew->rosterList 和 crew->rosterList 排序
	//index crew->roster
	//for (auto& roster : destDbData->rosterList) {
	//	shared_ptr<CREW> crew = destDbData->crewIdMap[roster->idcrew];
	//	if (crew != nullptr) {
	//		crew->rosterList.push_back(roster);
	//	}
	//}
	////sort crew.rosterList
	//for (auto& it : destDbData->crewIdMap) {
	//	shared_ptr<CREW> crew = it.second;
	//	std::stable_sort(crew->rosterList.begin(), crew->rosterList.end(), compareRosterByStartDT);
	//}

	//destDbData->preAssignRosterList = TransactionDataUtils::clone(srcDbData->preAssignRosterList);//预占roster列表（scenario：0） //TODO 需要深度复制 未使用，不处理

	//---------------- PO HeadCount of RO Leadin-----------------
	destDbData->rostersForPO = TransactionDataUtils::clone(srcDbData->rostersForPO);  //TODO 需要深度复制 已处理

	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 7");
	//步骤7：TAG 部分
	// tag table data
	destDbData->tagCategoryList = srcDbData->tagCategoryList;  //采用浅复制
	destDbData->tagGroupTableMap = srcDbData->tagGroupTableMap;  //采用浅复制
	destDbData->tagGroupMap = srcDbData->tagGroupMap;  //采用浅复制，需要处理TAG_GROUP，已处理 需要仔细测试一下
	destDbData->tagFlightGroupMap = srcDbData->tagFlightGroupMap;  //采用浅复制
	destDbData->tagFlightCompositionGroupMap = srcDbData->tagFlightCompositionGroupMap;  //采用浅复制
	destDbData->tagDutyGroupMap = srcDbData->tagDutyGroupMap;  //采用浅复制
	destDbData->tagPairingGroupMap = srcDbData->tagPairingGroupMap;  //采用浅复制
	destDbData->tagRosterGroundGroupMap = srcDbData->tagRosterGroundGroupMap;  //采用浅复制

	destDbData->tagSuperCategoryList = srcDbData->tagSuperCategoryList;  //采用浅复制
	destDbData->tagSuperCategoryMapList = srcDbData->tagSuperCategoryMapList;  //采用浅复制
	destDbData->departmentGroupList = srcDbData->departmentGroupList;  //采用浅复制
	//destDbData->historyCrewStatisticsList = TransactionDataUtils::clone(srcDbData->historyCrewStatisticsList);  //TODO 需要深度复制，已处理 统计数据未使用不需要处理
	//destDbData->historyCrewStatisticsMap = TransactionDataUtils::clone(srcDbData->historyCrewStatisticsMap);  //TODO 需要深度复制，已处理  统计数据未使用不需要处理 ？？？？ historyCrewStatisticsList 与 historyCrewStatisticsMap 是否需要同一对象？
	//destDbData->historyDepartmentStatisticsList = TransactionDataUtils::clone(srcDbData->historyDepartmentStatisticsList);  //TODO 需要深度复制，已处理 统计数据未使用不需要处理

	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 8");
	//步骤8：Manday 部分
	destDbData->_calculationMandayMap = srcDbData->_calculationMandayMap; //key:type, value:item, eg: key=BH, value={START=Sch, END=Act}

	//步骤9：其他
	destDbData->routeActualRestList = TransactionDataUtils::clone(srcDbData->routeActualRestList);  //OP#1888 //TODO 需要深度复制，同步消息处理 已处理

	//map<string, RecencySetWithHashAndEqual> crewRecencyMap;     //按crewId/dep/arv/fleet/role/rank保存最新recency, 通过 unordered_set<recency, hash, equal>排除重复
	destDbData->recencyMgr.recencyMap = srcDbData->recencyMgr.recencyMap;
	destDbData->recencyMgr.crewIndex = srcDbData->recencyMgr.crewIndex; //采用浅复制
	destDbData->recencyMgr._crewRecencyRules = srcDbData->recencyMgr._crewRecencyRules;//采用浅复制
	destDbData->recencyMgr._crewFleetRecencyMap = srcDbData->recencyMgr._crewFleetRecencyMap;//采用浅复制
	destDbData->recencyMgr._crewPortRecencyMap = srcDbData->recencyMgr._crewPortRecencyMap;//采用浅复制
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 8.1, mergeRosterFlight size:{}", srcDbData->mergeRosterFlight.size());
	destDbData->mergeRosterFlight = srcDbData->mergeRosterFlight; //采用浅复制
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 8.1.1");
	destDbData->rosterFlightMgr.crewIndex = srcDbData->rosterFlightMgr.crewIndex; //采用浅复制
	destDbData->rosterFlightMgr.flightIndex = srcDbData->rosterFlightMgr.flightIndex; //采用浅复制
	destDbData->rosterFlightMgr.pairingIndex = srcDbData->rosterFlightMgr.pairingIndex; //采用浅复制
	destDbData->mergeNewIdToOldId = srcDbData->mergeNewIdToOldId; //TODO 需要深度复制 已处理，仅Ruletool使用
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 8.2");
	destDbData->dictionaryList = srcDbData->dictionaryList;//采用浅复制
	destDbData->dictionaryMap = srcDbData->dictionaryMap;//采用浅复制
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 8.3");

	//步骤9：Training相关数据  request目前无Training法规，数据暂不需要复制
	destDbData->tmTrainingConfigList = srcDbData->tmTrainingConfigList; //采用浅复制
	destDbData->tmTrainingConfigIndex = srcDbData->tmTrainingConfigIndex; //采用浅复制

	destDbData->tmCourseList = srcDbData->tmCourseList; //采用浅复制
	destDbData->tmCourseMap = srcDbData->tmCourseMap; //采用浅复制
	destDbData->tmCourseCodeMap = srcDbData->tmCourseCodeMap; //采用浅复制

	destDbData->tmCourseBriefList = srcDbData->tmCourseBriefList; //采用浅复制
	destDbData->tmCourseBriefIndex = srcDbData->tmCourseBriefIndex;

	destDbData->tmCourseDurationList = srcDbData->tmCourseDurationList; //采用浅复制
	destDbData->tmCourseDurationIndex = srcDbData->tmCourseDurationIndex;

	destDbData->tmCourseRoleList = srcDbData->tmCourseRoleList; //采用浅复制
	destDbData->tmCourseRoleIndex = srcDbData->tmCourseRoleIndex;

	destDbData->tmCourseRoleBaseList = srcDbData->tmCourseRoleBaseList; //采用浅复制
	destDbData->tmCourseRoleBaseIndex = srcDbData->tmCourseRoleBaseIndex;

	destDbData->tmCourseRoleQualList = srcDbData->tmCourseRoleQualList; //采用浅复制
	destDbData->tmCourseRoleQualIndex = srcDbData->tmCourseRoleQualIndex;

	destDbData->tmCourseRoleDeviceList = srcDbData->tmCourseRoleDeviceList; //采用浅复制
	destDbData->tmCourseRoleDeviceIndex = srcDbData->tmCourseRoleDeviceIndex;

	destDbData->tmFootprintList = srcDbData->tmFootprintList; //采用浅复制
	destDbData->tmFootprintIndex = srcDbData->tmFootprintIndex;

	destDbData->tmFootprintCourseList = srcDbData->tmFootprintCourseList; //采用浅复制
	destDbData->tmFootprintCourseIndex = srcDbData->tmFootprintCourseIndex;

	destDbData->tmFootprintCourseTraineeList = srcDbData->tmFootprintCourseTraineeList; //采用浅复制
	destDbData->tmFootprintCourseTraineeIndex = srcDbData->tmFootprintCourseTraineeIndex;

	destDbData->tmFootprintCourseIpRoleList = srcDbData->tmFootprintCourseIpRoleList; //采用浅复制
	destDbData->tmFootprintCourseIpRoleIndex = srcDbData->tmFootprintCourseIpRoleIndex;

	destDbData->tmFootprintCourseIpRoleBaseList = srcDbData->tmFootprintCourseIpRoleBaseList; //采用浅复制
	destDbData->tmFootprintCourseIpRoleBaseIndex = srcDbData->tmFootprintCourseIpRoleBaseIndex;

	destDbData->tmFootprintCourseIpRoleQualList = srcDbData->tmFootprintCourseIpRoleQualList; //采用浅复制
	destDbData->tmFootprintCourseIpRoleQualIndex = srcDbData->tmFootprintCourseIpRoleQualIndex;

	destDbData->tmFootprintCourseRoleList = srcDbData->tmFootprintCourseRoleList; //采用浅复制
	destDbData->tmFootprintCourseRoleIndex = srcDbData->tmFootprintCourseRoleIndex;

	destDbData->tmFootprintCourseRoleQualList = srcDbData->tmFootprintCourseRoleQualList; //采用浅复制
	destDbData->tmFootprintCourseRoleQualIndex = srcDbData->tmFootprintCourseRoleQualIndex;

	destDbData->tmFootprintCourseRoleLimitationList = srcDbData->tmFootprintCourseRoleLimitationList; //采用浅复制
	destDbData->tmFootprintCourseRoleLimitationIndex = srcDbData->tmFootprintCourseRoleLimitationIndex;

	destDbData->tmProgramList = srcDbData->tmProgramList; //采用浅复制
	destDbData->tmProgramIndex = srcDbData->tmProgramIndex;

	destDbData->tmProgramBuddyList = srcDbData->tmProgramBuddyList; //采用浅复制
	destDbData->tmProgramBuddyIndex = srcDbData->tmProgramBuddyIndex;

	destDbData->tmProgramBuddyTimeList = srcDbData->tmProgramBuddyTimeList; //采用浅复制
	destDbData->tmProgramBuddyTimeIndex = srcDbData->tmProgramBuddyTimeIndex;

	destDbData->tmProgramBuddyCourseList = srcDbData->tmProgramBuddyCourseList; //采用浅复制
	destDbData->tmProgramBuddyCourseIndex = srcDbData->tmProgramBuddyCourseIndex;

	destDbData->tmProgramPipList = srcDbData->tmProgramPipList; //采用浅复制
	destDbData->tmProgramPipIndex = srcDbData->tmProgramPipIndex;

	destDbData->tmProgramCourseMap = srcDbData->tmProgramCourseMap; //采用浅复制
	destDbData->tmProgramCourseIndex = srcDbData->tmProgramCourseIndex;

	destDbData->tmProgramCourseInstructorMap = srcDbData->tmProgramCourseInstructorMap; //采用浅复制
	destDbData->tmProgramCourseInstructorIndex = srcDbData->tmProgramCourseInstructorIndex;

	destDbData->tmProgramCourseLimitationList = srcDbData->tmProgramCourseLimitationList; //采用浅复制
	destDbData->tmProgramCourseLimitationIndex = srcDbData->tmProgramCourseLimitationIndex;

	destDbData->tmProgramCourseIpRelevanceList = srcDbData->tmProgramCourseIpRelevanceList; //采用浅复制
	destDbData->tmProgramCourseIpRelevanceIndex = srcDbData->tmProgramCourseIpRelevanceIndex;

	destDbData->tmProgramCourseRoleList = srcDbData->tmProgramCourseRoleList; //采用浅复制
	destDbData->tmProgramCourseRoleIndex = srcDbData->tmProgramCourseRoleIndex;

	destDbData->tmProgramCourseRoleQualList = srcDbData->tmProgramCourseRoleQualList; //采用浅复制
	destDbData->tmProgramCourseRoleQualIndex = srcDbData->tmProgramCourseRoleQualIndex;

	destDbData->tmProgramCourseRoleLimitationList = srcDbData->tmProgramCourseRoleLimitationList; //采用浅复制
	destDbData->tmProgramCourseRoleLimitationIndex = srcDbData->tmProgramCourseRoleLimitationIndex;

	destDbData->tmProgramCourseIpRoleList = srcDbData->tmProgramCourseIpRoleList; //采用浅复制
	destDbData->tmProgramCourseIpRoleIndex = srcDbData->tmProgramCourseIpRoleIndex;

	destDbData->tmProgramCourseIpRoleBaseList = srcDbData->tmProgramCourseIpRoleBaseList; //采用浅复制
	destDbData->tmProgramCourseIpRoleBaseIndex = srcDbData->tmProgramCourseIpRoleBaseIndex;

	destDbData->tmProgramCourseIpRoleQualList = srcDbData->tmProgramCourseIpRoleQualList; //采用浅复制
	destDbData->tmProgramCourseIpRoleQualIndex = srcDbData->tmProgramCourseIpRoleQualIndex;

	destDbData->tmProgramCoursePnrList = srcDbData->tmProgramCoursePnrList; //采用浅复制
	destDbData->tmProgramCoursePnrIndex = srcDbData->tmProgramCoursePnrIndex;

	destDbData->tmProgramCourseIpckList = srcDbData->tmProgramCourseIpckList; //采用浅复制
	destDbData->tmProgramCourseIpckIndex = srcDbData->tmProgramCourseIpckIndex;

	destDbData->tmProgramCourseMoreList = srcDbData->tmProgramCourseMoreList; //采用浅复制
	destDbData->tmProgramCourseMoreIndex = srcDbData->tmProgramCourseMoreIndex;

	destDbData->tmProgramCourseMoreLegList = srcDbData->tmProgramCourseMoreLegList; //采用浅复制
	destDbData->tmProgramCourseMoreLegIndex = srcDbData->tmProgramCourseMoreLegIndex;

	destDbData->tmDeviceList = srcDbData->tmDeviceList; //采用浅复制
	destDbData->tmDeviceMap = srcDbData->tmDeviceMap;

	destDbData->tmDeviceTimeList = srcDbData->tmDeviceTimeList;  //采用浅复制
	destDbData->tmDeviceTimeIndex = srcDbData->tmDeviceTimeIndex;

	destDbData->tmPairingChartList = srcDbData->tmPairingChartList; //采用浅复制
	destDbData->tmPairingChartIndex = srcDbData->tmPairingChartIndex;

	destDbData->tmPairingChartRoleList = srcDbData->tmPairingChartRoleList; //采用浅复制
	destDbData->tmPairingChartRoleIndex = srcDbData->tmPairingChartRoleIndex;

	destDbData->tmPairingChartRoleQualList = srcDbData->tmPairingChartRoleQualList; //采用浅复制
	destDbData->tmPairingChartRoleQualIndex = srcDbData->tmPairingChartRoleQualIndex;

	destDbData->tmPairingChartCourseList = srcDbData->tmPairingChartCourseList; //采用浅复制
	destDbData->tmPairingChartCourseIndex = srcDbData->tmPairingChartCourseIndex;

	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 9");
	//步骤10：其他 - CA 特殊处理
	//FOR CA INT ADD BY CJ START 
	destDbData->crewIdToFltNumToCountForCA_INT = srcDbData->crewIdToFltNumToCountForCA_INT;
	destDbData->numHistoryFlyFlightsOnCrew = srcDbData->numHistoryFlyFlightsOnCrew;
	destDbData->studentsInfoForPreLockTeacherVec = srcDbData->studentsInfoForPreLockTeacherVec;  //采用浅复制
	destDbData->historyTeachingHoursForCACCInitialTeachingVec = srcDbData->historyTeachingHoursForCACCInitialTeachingVec;  //采用浅复制
	destDbData->crewHasTeachingTaskInLastPeriod = srcDbData->crewHasTeachingTaskInLastPeriod;
	destDbData->crewIdToNumEachMonthHistoryFlyPairingForCA_INT = srcDbData->crewIdToNumEachMonthHistoryFlyPairingForCA_INT;
	destDbData->crewIdToEachMonthFlyHoursOnCrewForCA_INT = srcDbData->crewIdToEachMonthFlyHoursOnCrewForCA_INT;
	//FOR CA INT ADD BY CJ END
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 9.1");
	//dbg ca_train start
	destDbData->crewIdToStartAndEndTime = srcDbData->crewIdToStartAndEndTime;
	destDbData->caccTeachingHistoryDetailsOfStudent = srcDbData->caccTeachingHistoryDetailsOfStudent;  //采用浅复制
	//dbg ca_train end

	//for cacc pairing start
	destDbData->koreaAndJapanExpatFlightToCompIdToCount = srcDbData->koreaAndJapanExpatFlightToCompIdToCount;
	//for cacc pairing end
	//for ak teaching start
	destDbData->crewIdToPhaseToPeriodsForAK = srcDbData->crewIdToPhaseToPeriodsForAK;
	//for ak teaching end
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 9.2");
	//6001 Cache
	//destDbData->_helper6001Cache = srcDbData->_helper6001Cache;
	//destDbData->_needPreAssignCache = srcDbData->_needPreAssignCache;
	//destDbData->_crewIdToRDOParamCache = srcDbData->_crewIdToRDOParamCache;
	//6001 在非RO场景时，改成仅加载当前crew的缓存，不在需要复制，并且需要重新计算
	destDbData->_needPreAssignCache = true;

	//法规服务化事务临时保存的crewList
	//for (auto& crew : srcDbData->crewList) {
	//	destDbData->_transactionCrewIdMap.insert(std::pair(crew->idCrew, std::make_tuple(crew->rosterList, crew->mandayFdList, crew->mandayCcAmList)));
	//}
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 9.3");
	destDbData->crewMonthMandayList = TransactionDataUtils::clone(srcDbData->crewMonthMandayList);
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 9.4");
	destDbData->crewRpRecencyList = srcDbData->crewRpRecencyList; //采用浅复制
	destDbData->crewRpRecencyIndex = srcDbData->crewRpRecencyIndex; //采用浅复制

	destDbData->dutyCodeLogicList = srcDbData->dutyCodeLogicList; //采用浅复制
	destDbData->dutyCodeLogicMap = makeDutyCodeLogicMap(srcDbData->dutyCodeLogicList);
	destDbData->dutyCodeTypeCompList = srcDbData->dutyCodeTypeCompList; //采用浅复制

	//destDbData->_isRequestScope = srcDbData->_isRequestScope; 接口调用时设置，这里不在设置
	//destDbData->_isServiceMode = srcDbData->_isServiceMode; 接口调用时设置，这里不在设置

	destDbData->_dataError = std::make_shared<DataError>(*srcDbData->_dataError);
	//Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data 10");
	Logger::getRuleLogger()->debug("[CrewDataContext] copy transaction data end, cost {} ms.", ((clock() - lapsed) * 1000) / CLOCKS_PER_SEC);
}

void CrewDataContext::copy(const shared_ptr<CrewDataContext>& srcDbData, const shared_ptr<CrewDataContext>& destDbData) {
	Logger::getRuleLogger()->debug("[CrewDataContext] copy start");
	//简便起见全部public
	destDbData->version = srcDbData->version;//20201021 区分版本2.0/3.0
	destDbData->loginDivision = srcDbData->loginDivision;//20201021 客户端登录division
	destDbData->divisionConstruction = srcDbData->divisionConstruction;//根据divisionContruction赋值配比
	destDbData->scenarioId = srcDbData->scenarioId;
	destDbData->leadinScenarioId = srcDbData->leadinScenarioId; //for PO
	destDbData->scenario = srcDbData->scenario;
	destDbData->startUtc = srcDbData->startUtc; //LOCAL 00:00 in UTC
	destDbData->endUtc = srcDbData->endUtc;   //LOCAL 23:59 in UTC

	//回调函数实例
	destDbData->mandayForRosterCalculator = srcDbData->mandayForRosterCalculator;

	destDbData->username = srcDbData->username;  //mantis#3111, username for 'modifyBy' field of saving data
	destDbData->configDataSource = srcDbData->configDataSource;   //DB\Server
	destDbData->configDataSourceUrl = srcDbData->configDataSourceUrl; //server host

	destDbData->applicationType = srcDbData->applicationType;                                 //OR, RuleSrv
	destDbData->configInputLog = srcDbData->configInputLog;                                  //default=true, 是否记录input log: ro_input_rules.txt/ ro_input_pairing.txt ...
	//PairingDBContext                       *dbCtx;
	destDbData->httpAuthToken = srcDbData->httpAuthToken;
	//CsvEvaCrDefaultDutyTime

	destDbData->tempIdGenerator.store(srcDbData->tempIdGenerator);   //临时id生成器，	
	destDbData->CsvEvaCrDefaultDutyTimeMap = srcDbData->CsvEvaCrDefaultDutyTimeMap;

	//步骤1：静态数据克隆
	destDbData->systemParamMap = srcDbData->systemParamMap;

	destDbData->baseList = srcDbData->baseList;

	destDbData->cqfList = srcDbData->cqfList;
	destDbData->cqfList2 = srcDbData->cqfList2; //为统一rule、cqf读取逻辑，过渡阶段增加以rule方式读取cqf

	destDbData->holidays = TransactionDataUtils::clone(srcDbData->holidays); //按airline和场景时间段筛选holiday //TODO 需要深度复制  已处理

	destDbData->airportList = srcDbData->airportList;
	destDbData->airportCodeMap.clear();
	//destDbData->airportCodeMap = srcDbData->airportCodeMap; //TODO 需要深度复制   已处理
	for (auto& airport : destDbData->airportList) {
		destDbData->airportCodeMap[airport.airport] = &airport;
	}
	destDbData->airportUtcOffsetMap = srcDbData->airportUtcOffsetMap; //机场的时区offset对应表，机场三字码 -> 时区分钟数，如北京8时区对应值为8*60=480
	destDbData->airportZoneIdMap = srcDbData->airportZoneIdMap; //机场的ZoneId对应表，机场三字码 -> ZoneId
	destDbData->airportDistanceMap = srcDbData->airportDistanceMap; //机场距离表

	destDbData->rankList = srcDbData->rankList;
	destDbData->rankMap = srcDbData->rankMap;

	destDbData->teamList = srcDbData->teamList;

	destDbData->pairingCompositionList = srcDbData->pairingCompositionList;

	destDbData->rankToPositionMap = srcDbData->rankToPositionMap;

	destDbData->fleetList = srcDbData->fleetList;
	destDbData->fleetMap = srcDbData->fleetMap;
	destDbData->subFleetList = srcDbData->subFleetList;
	destDbData->subFleetMap = srcDbData->subFleetMap;

	destDbData->fatigueMap = srcDbData->fatigueMap;

	destDbData->rosterPeriodList = srcDbData->rosterPeriodList;
	destDbData->guaranteeFlyHoursList = TransactionDataUtils::clone(srcDbData->guaranteeFlyHoursList); //TODO 需要深度复制  已处理

	destDbData->portQualReqmnts = srcDbData->portQualReqmnts;
	destDbData->portQualReqmntsAirportMap = srcDbData->portQualReqmntsAirportMap;

	destDbData->rankActingList = srcDbData->rankActingList;

	destDbData->totalAssignmentIdMap = TransactionDataUtils::clone(srcDbData->totalAssignmentIdMap); //包含所有assignment， 内容为map<assignment_id, assignment> //TODO 需要深度复制 已处理
	destDbData->assignmentNameMap.clear();
	//destDbData->assignmentNameMap = TransactionDataUtils::clone(srcDbData->assignmentNameMap); //TODO 需要深度复制 已处理
	for (auto& pair : destDbData->totalAssignmentIdMap) {
		if (pair.second != NULL)
			destDbData->assignmentNameMap[pair.second->assignment] = pair.second;
	}
	//AssignmentHolder TODO 单实例数据，如何处理？？？？
	destDbData->liveConfigList = TransactionDataUtils::clone(srcDbData->liveConfigList); //需要深度复制
	destDbData->rulePhaseConfigMap = TransactionDataUtils::clone(srcDbData->rulePhaseConfigMap); //需要深度复制
	destDbData->ruleSetList = TransactionDataUtils::clone(srcDbData->ruleSetList); //需要深度复制
	destDbData->rule_8014 = TransactionDataUtils::clone(srcDbData->rule_8014); //TODO 需要深度复制 已处理

	destDbData->ruleList = srcDbData->ruleList;//法规规则明细 //TODO 需要深度复制, specialRulePortQualReqmnts 未使用不需要处理，dbRule.parsedParam 需要克隆 已处理
	parseRuleParams(destDbData->ruleList, destDbData->rule_8014);//处理dbRule.parsedParam
	std::sort(destDbData->ruleList.begin(), destDbData->ruleList.end(), DBRule::compare);

	destDbData->allRuleList = srcDbData->allRuleList;//法规规则明细 //TODO 需要深度复制
	std::sort(destDbData->allRuleList.begin(), destDbData->allRuleList.end(), DBRule::compare);

	destDbData->indexRule8014DutyGrp = srcDbData->indexRule8014DutyGrp;   //rule=8014 数据索引
	//destDbData->_ruleFuncMap = srcDbData->_ruleFuncMap; //为保证线程安全，不暴露为public  //TODO 需要深度复制 _ruleFuncMap 运行中计算，不需要处理
	//destDbData->_emptyFunc = srcDbData->_emptyFunc;  //TODO 需要深度复制, _emptyFunc 表示空，不需要处理
	destDbData->_ruleFuncList = srcDbData->_ruleFuncList; //法规规则ID列表

	destDbData->totalAssignGrps = srcDbData->totalAssignGrps;
	destDbData->assignmentNameGroupMap = srcDbData->assignmentNameGroupMap;

	destDbData->assignmentOverlappable = TransactionDataUtils::clone(srcDbData->assignmentOverlappable);  //TODO 需要深度复制 已处理
	//记录可以不检查休息的duty类型搭配
	destDbData->assignmentMrtOveride.clear();
	destDbData->assignmentOverlappableType.clear();
	//destDbData->assignmentMrtOveride = TransactionDataUtils::clone(srcDbData->assignmentMrtOveride); //TODO 需要深度复制 已处理
	for (std::size_t i = 0; i < destDbData->assignmentOverlappable.size(); i++) {
		SharedPtr<ASSIGNMENT_OVERLAPPABLE> obj = destDbData->assignmentOverlappable[i];
		if (obj->type == "MRT_OVERRIDE") {
			destDbData->assignmentMrtOveride.push_back(obj);
		}
		if (obj->type == "OVERLAPPABLE") {
			destDbData->assignmentOverlappableType.push_back(obj);
		}
	}
	destDbData->overlapableAssignmentMap = srcDbData->overlapableAssignmentMap;

	destDbData->compositionList = srcDbData->compositionList;           //comp_id
	destDbData->compositionLoadList = srcDbData->compositionLoadList;
	destDbData->compositionRankMap = srcDbData->compositionRankMap;//<compId, comp>
	destDbData->compositionRankOptionMap = srcDbData->compositionRankOptionMap;//<compId, comp> 3.0 适配多个option

	destDbData->crossRankRuleList = TransactionDataUtils::clone(srcDbData->crossRankRuleList); //TODO 需要深度复制 已处理 代码中未使用

	//Aircraft
	destDbData->fltIdToAircraftMap = TransactionDataUtils::clone(srcDbData->fltIdToAircraftMap); //TODO 需要深度复制 已处理

	destDbData->routeList = TransactionDataUtils::clone(srcDbData->routeList);            //OP#1901 //TODO 需要深度复制 已处理

	destDbData->routeRadiationConfigList = srcDbData->routeRadiationConfigList;

	//destDbData->csvPairingDutyNodeList = TransactionDataUtils::clone(srcDbData->csvPairingDutyNodeList); //TODO 需要深度复制 未使用

	destDbData->rankCombinationCriteriaMap = TransactionDataUtils::clone(srcDbData->rankCombinationCriteriaMap); //OP#1901 //TODO 需要深度复制 已处理

	destDbData->rankCombinationMap = TransactionDataUtils::clone(srcDbData->rankCombinationMap); //TODO 需要深度复制 已处理

	destDbData->rankCombIdToActingRankToNum = srcDbData->rankCombIdToActingRankToNum; //8091seqOrder列组成的最大配比

	destDbData->scenarioKpiMap = srcDbData->scenarioKpiMap; //优化参数

	destDbData->briefingNameMap = TransactionDataUtils::clone(srcDbData->briefingNameMap);  //TODO 需要深度复制 已处理

	destDbData->crewBases = TransactionDataUtils::clone(srcDbData->crewBases);  //TODO 需要深度复制 已处理

	destDbData->attributeIdMap = srcDbData->attributeIdMap;
	destDbData->attributeNameMap = srcDbData->attributeNameMap;

	destDbData->voyageList = TransactionDataUtils::clone(srcDbData->voyageList);  //TODO 需要深度复制，需要复制 VoyageDetail,已处理

	//map<string, vector<SharedPtr<Teaching>>> teachingOfStudent;                             //key: student_id, value: teachings
	destDbData->teachingOfStudent = TransactionDataUtils::clone(srcDbData->teachingOfStudent);  //TODO 需要深度复制，需要复制 TeachingDetail，已处理

	//CREW_TEAM_DATA                         crewTeam;  //数据接口： crewTeam.getTeamByCrew(string idcrew);

	//步骤2：航班相关克隆
	destDbData->flightList = TransactionDataUtils::clone(srcDbData->flightList); //按 scenario.start/end/fleet/筛选航班 //TODO 需要深度复制 已处理
	destDbData->flightIdMap.clear();
	//destDbData->flightIdMap = TransactionDataUtils::clone(srcDbData->flightIdMap); //TODO 需要深度复制 已处理
	for (auto& flight : destDbData->flightList) {
		destDbData->flightIdMap[flight->getDBId()] = flight;
	}

	//flight对于pairing的索引 每次都需更新
	destDbData->flightIdToPairing = srcDbData->flightIdToPairing;
	destDbData->otherScenarioInSameGroup = srcDbData->otherScenarioInSameGroup;              //同组其他scenario id

	destDbData->resourceCtrlIdMap = srcDbData->resourceCtrlIdMap;  //map<cqfId, resourceCtrl<key, value>>, in which key=dtStr + ":" + base + ":" + rank + ":" + fleet + ":" + airport
	destDbData->resourceCtrlBaseBlh = srcDbData->resourceCtrlBaseBlh;

	//步骤3：Pairing、Duty和Segment相关克隆
	destDbData->pairingList = TransactionDataUtils::clone(srcDbData->pairingList);  //pairing全集，包括场景条件筛选、预占 //TODO 需要深度复制， _segments、_flySegments、_mandayTimesFDP、_mandayTimesOther 不需要复制，复制包括：Pairing._dutyVec（Duty和Segment） 已处理
	destDbData->pairingIdMap.clear();
	//destDbData->pairingIdMap = TransactionDataUtils::clone(srcDbData->pairingIdMap);  //key:pairing_id, value:pairing, for RO only  //TODO 需要深度复制 已处理
	for (auto& p : destDbData->pairingList) {
		if (p == nullptr) {
			continue;
		}
		destDbData->pairingIdMap[p->getDbId()] = p;
	}

	destDbData->pairingLabelMap.clear();
	makePairingLabelMapIndex(destDbData->pairingList, destDbData->pairingLabelMap);

	destDbData->pairingListForRO.clear();
	//destDbData->pairingListForRO = TransactionDataUtils::clone(srcDbData->pairingListForRO);  //用于RO计算的 pairing，只包含来自 idscenario_pair的部分 //TODO 需要深度复制 已处理
	for (auto& pairingForRO : srcDbData->pairingListForRO) {
		destDbData->pairingListForRO.push_back(destDbData->pairingIdMap[pairingForRO->getDbId()]);
	}

	destDbData->pairingListForROWithOpenComposition.clear();
	//destDbData->pairingListForROWithOpenComposition = TransactionDataUtils::clone(srcDbData->pairingListForROWithOpenComposition); //用于OR作为输入：指定rank还有剩余openComposition的pairing //TODO 需要深度复制 已处理
	for (auto& pairingForRO : srcDbData->pairingListForROWithOpenComposition) {
		destDbData->pairingListForROWithOpenComposition.push_back(destDbData->pairingIdMap[pairingForRO->getDbId()]);
	}

	destDbData->preAssignPairingList.clear();
	//destDbData->preAssignPairingList = TransactionDataUtils::clone(srcDbData->preAssignPairingList);  //预占roster覆盖pairing //TODO 需要深度复制 已处理
	for (auto& preAssignPairing : srcDbData->preAssignPairingList) {
		destDbData->preAssignPairingList.push_back(destDbData->pairingIdMap[preAssignPairing->getDbId()]);
	}

	destDbData->fltToPairingMap = srcDbData->fltToPairingMap;      //key:flt_id, value:pairing id list, for RO only

	//步骤4：PO算法相关克隆
	//---------------- PO START -----------------  
	destDbData->pairingListBeforeRun.clear();
	//destDbData->pairingListBeforeRun = TransactionDataUtils::clone(srcDbData->pairingListBeforeRun); //TODO 需要深度复制   已处理
	for (auto& pairing : srcDbData->pairingListBeforeRun) {
		destDbData->pairingListBeforeRun.push_back(destDbData->pairingIdMap[pairing->getDbId()]);
	}
	stable_sort(destDbData->pairingListBeforeRun.begin(), destDbData->pairingListBeforeRun.end(), [](Pairing* a, Pairing* b) -> bool {
		return a->getDbId() > b->getDbId();
	});

	destDbData->pairingListLeadin.clear();
	//destDbData->pairingListLeadin = TransactionDataUtils::clone(srcDbData->pairingListLeadin); //TODO 需要深度复制   已处理
	for (auto& pairing : srcDbData->pairingListLeadin) {
		destDbData->pairingListLeadin.push_back(destDbData->pairingIdMap[pairing->getDbId()]);
	}

	destDbData->pairingInputFlights = srcDbData->pairingInputFlights;

	destDbData->pairingInputFerrys = TransactionDataUtils::clone(srcDbData->pairingInputFerrys); //TODO 需要深度复制  已处理
	//pairingInputFerrys loadCsvFlightCommute()
	destDbData->ferryFltIdMap.clear();
	//destDbData->ferryFltIdMap = TransactionDataUtils::clone(srcDbData->ferryFltIdMap); //TODO 需要深度复制  已处理
	for (auto& seg : destDbData->pairingInputFerrys) {
		destDbData->ferryFltIdMap[seg->getDBId()] = seg;
	}

	destDbData->leadinOccupy = srcDbData->leadinOccupy;       //leadin中每个base占用的 composition占用小时总数，如某PEK的pairing配比1CA 1FO 下属一个flt blk=2h，则map<'PEK',(1+1)x2>
	destDbData->leadinPairings.clear();
	//destDbData->leadinPairings = TransactionDataUtils::clone(srcDbData->leadinPairings); //TODO 需要深度复制  已处理
	for (auto& pairing : srcDbData->leadinPairings) {
		destDbData->leadinPairings.push_back(destDbData->pairingIdMap[pairing->getDbId()]);
	}

	destDbData->dutyLimitPerDay = srcDbData->dutyLimitPerDay;      //key=base, value=该base从场景第[0]天开始每一天duty上限，若场景包含法规2029则为减去该日leadin duty数之后结果
	destDbData->attributeNames = srcDbData->attributeNames;      //保存所有attribute名称
	destDbData->optimizationNecessity = TransactionDataUtils::clone(srcDbData->optimizationNecessity); //保存对应航空公司的必要法规 //TODO 需要深度复制 已处理

	//destDbData->originalFlightComposition = srcDbData->originalFlightComposition;

	destDbData->bidSequenceGroups = srcDbData->bidSequenceGroups; //潜复制
	destDbData->biddingResults = srcDbData->biddingResults; //潜复制

	destDbData->qualExtensionConfigList = srcDbData->qualExtensionConfigList; //RO使用，潜复制
	destDbData->qualExtensionConfigMap = srcDbData->qualExtensionConfigMap; //RO使用，潜复制
	//---------------- PO END -----------------


	//步骤5：处理CREW和COF CREW相关克隆
	destDbData->crewTotalList = TransactionDataUtils::clone(srcDbData->crewTotalList, *destDbData); //所有crew 包括cof //TODO 需要深度复制， 需要复制内部segment 已处理
	destDbData->crewIdMap.clear();
	//destDbData->crewIdMap = TransactionDataUtils::clone(srcDbData->crewIdMap); //map<idcrew, crew>以便动态查找crew数据，value来自 crewTotalList //TODO 需要深度复制 已处理
	for (auto& crew : destDbData->crewTotalList) {
		destDbData->crewIdMap[crew->idCrew] = crew;
	}

	destDbData->crewList.clear();
	//destDbData->crewList = TransactionDataUtils::clone(srcDbData->crewList);  //TODO 需要深度复制， 已处理
	for (auto& crew : srcDbData->crewList) {
		destDbData->crewList.push_back(destDbData->crewIdMap[crew->idCrew]);
	}
	makeIndexCrewBaseRankFleet(destDbData.get()); //创建 crew->index  索引

	makeIndexCrewKpiAdjust(destDbData.get());//创建 crewKpiAdjust->index  索引

	destDbData->crewOnPairing = TransactionDataUtils::clone(srcDbData->crewOnPairing, *destDbData); // key:pairingId, value:crewId list //TODO 需要深度复制, CrewOnFlight.Crew需要处理 已处理
	//multimap<long long, string> crewOnPairing; // key:pairingId, value:crewId list

	destDbData->crewOnFlt = TransactionDataUtils::clone(srcDbData->crewOnFlt, *destDbData); //TODO 需要深度复制 已处理

	//步骤6：处理Roster相关克隆
	destDbData->rosterList = TransactionDataUtils::clone(srcDbData->rosterList, *destDbData);//TODO 需要深度复制， 已处理
	//index crew->roster
	for (auto& roster : destDbData->rosterList) {
		shared_ptr<CREW> crew = destDbData->crewIdMap[roster->idcrew];
		if (crew != nullptr) {
			crew->rosterList.push_back(roster);
		}
	}
	//sort crew.rosterList
	for (auto& it : destDbData->crewIdMap) {
		shared_ptr<CREW> crew = it.second;
		std::stable_sort(crew->rosterList.begin(), crew->rosterList.end(), compareRosterByStartDT);
	}

	//destDbData->preAssignRosterList = TransactionDataUtils::clone(srcDbData->preAssignRosterList);//预占roster列表（scenario：0） //TODO 需要深度复制 未使用，不处理

	//---------------- PO HeadCount of RO Leadin-----------------
	destDbData->rostersForPO = TransactionDataUtils::clone(srcDbData->rostersForPO);  //TODO 需要深度复制 已处理


	//步骤7：TAG 部分
	// tag table data
	destDbData->tagCategoryList = TransactionDataUtils::clone(srcDbData->tagCategoryList);  //TODO 需要深度复制，已处理
	destDbData->tagGroupTableMap = TransactionDataUtils::clone(srcDbData->tagGroupTableMap);  //TODO 需要深度复制，已处理
	destDbData->tagGroupMap = TransactionDataUtils::clone(srcDbData->tagGroupMap, destDbData->tagGroupTableMap);  //TODO 需要深度复制，需要处理TAG_GROUP，已处理 需要仔细测试一下
	destDbData->tagFlightGroupMap = TransactionDataUtils::clone(srcDbData->tagFlightGroupMap);  //TODO 需要深度复制，已处理
	destDbData->tagFlightCompositionGroupMap = TransactionDataUtils::clone(srcDbData->tagFlightCompositionGroupMap);  //TODO 需要深度复制，已处理
	destDbData->tagDutyGroupMap = TransactionDataUtils::clone(srcDbData->tagDutyGroupMap);  //TODO 需要深度复制，已处理
	destDbData->tagPairingGroupMap = TransactionDataUtils::clone(srcDbData->tagPairingGroupMap);  //TODO 需要深度复制，已处理
	destDbData->tagRosterGroundGroupMap = TransactionDataUtils::clone(srcDbData->tagRosterGroundGroupMap);  //TODO 需要深度复制，已处理

	destDbData->tagSuperCategoryList = TransactionDataUtils::clone(srcDbData->tagSuperCategoryList);  //TODO 需要深度复制，已处理
	destDbData->tagSuperCategoryMapList = TransactionDataUtils::clone(srcDbData->tagSuperCategoryMapList);  //TODO 需要深度复制，已处理
	destDbData->departmentGroupList = TransactionDataUtils::clone(srcDbData->departmentGroupList);  //TODO 需要深度复制，已处理
	//destDbData->historyCrewStatisticsList = TransactionDataUtils::clone(srcDbData->historyCrewStatisticsList);  //TODO 需要深度复制，已处理 统计数据未使用不需要处理
	//destDbData->historyCrewStatisticsMap = TransactionDataUtils::clone(srcDbData->historyCrewStatisticsMap);  //TODO 需要深度复制，已处理  统计数据未使用不需要处理 ？？？？ historyCrewStatisticsList 与 historyCrewStatisticsMap 是否需要同一对象？
	//destDbData->historyDepartmentStatisticsList = TransactionDataUtils::clone(srcDbData->historyDepartmentStatisticsList);  //TODO 需要深度复制，已处理 统计数据未使用不需要处理

	//步骤8：Manday 部分
	destDbData->_calculationMandayMap = srcDbData->_calculationMandayMap; //key:type, value:item, eg: key=BH, value={START=Sch, END=Act}

	//步骤9：其他
	destDbData->routeActualRestList = TransactionDataUtils::clone(srcDbData->routeActualRestList);  //OP#1888 //TODO 需要深度复制，同步消息处理 已处理

	//map<string, RecencySetWithHashAndEqual> crewRecencyMap;     //按crewId/dep/arv/fleet/role/rank保存最新recency, 通过 unordered_set<recency, hash, equal>排除重复
	destDbData->recencyMgr.recencyMap = srcDbData->recencyMgr.recencyMap;
	destDbData->recencyMgr.crewIndex = TransactionDataUtils::clone(srcDbData->recencyMgr.crewIndex); //TODO 需要深度复制
	destDbData->recencyMgr._crewRecencyRules = TransactionDataUtils::clone(srcDbData->recencyMgr._crewRecencyRules);
	destDbData->recencyMgr._crewFleetRecencyMap = TransactionDataUtils::clone(srcDbData->recencyMgr._crewFleetRecencyMap);
	destDbData->recencyMgr._crewPortRecencyMap = TransactionDataUtils::clone(srcDbData->recencyMgr._crewPortRecencyMap);

	destDbData->mergeRosterFlight = TransactionDataUtils::clone(srcDbData->mergeRosterFlight); //TODO 需要深度复制 已处理
	destDbData->rosterFlightMgr.crewIndex.clear();
	destDbData->rosterFlightMgr.flightIndex.clear();
	destDbData->rosterFlightMgr.pairingIndex.clear();
	for (auto& pair : destDbData->mergeRosterFlight) {
		for (auto& rf : pair.second) {
			//创建rosterFlightMgr的crewIndex、flightIndex、pairingIndex
			destDbData->rosterFlightMgr.add(rf);
		}
	}
	//destDbData->rosterFlightMgr.crewIndex = TransactionDataUtils::clone(srcDbData->rosterFlightMgr.crewIndex); //TODO 需要深度复制 已处理
	//destDbData->rosterFlightMgr.flightIndex = TransactionDataUtils::clone(srcDbData->rosterFlightMgr.flightIndex); //TODO 需要深度复制 已处理
	//destDbData->rosterFlightMgr.pairingIndex = TransactionDataUtils::clone(srcDbData->rosterFlightMgr.pairingIndex); //TODO 需要深度复制 已处理
	destDbData->mergeNewIdToOldId = srcDbData->mergeNewIdToOldId; //TODO 需要深度复制 已处理，仅Ruletool使用

	destDbData->dictionaryList = TransactionDataUtils::clone(srcDbData->dictionaryList);
	destDbData->dictionaryMap.clear();
	destDbData->makeDictionaryMap();

	destDbData->tmTrainingConfigList = TransactionDataUtils::clone(srcDbData->tmTrainingConfigList);
	destDbData->tmTrainingConfigIndex = std::make_shared<TmTrainingConfigIndex>(destDbData->tmTrainingConfigList);

	destDbData->tmCourseList = TransactionDataUtils::clone(srcDbData->tmCourseList);
	destDbData->tmCourseMap.clear();
	destDbData->tmCourseCodeMap.clear();
	for (auto& tmCourse : destDbData->tmCourseList) {
		destDbData->tmCourseMap.insert(make_pair(tmCourse->id, tmCourse));
		destDbData->tmCourseCodeMap.insert(make_pair(tmCourse->courseCode, tmCourse));
	}

	destDbData->tmCourseBriefList = TransactionDataUtils::clone(srcDbData->tmCourseBriefList);
	destDbData->tmCourseBriefIndex = std::make_shared<TmCourseBriefIndex>(destDbData->tmCourseBriefList);

	destDbData->tmCourseDurationList = TransactionDataUtils::clone(srcDbData->tmCourseDurationList);
	destDbData->tmCourseDurationIndex = std::make_shared<TmCourseDurationIndex>(destDbData->tmCourseDurationList);

	destDbData->tmCourseRoleList = TransactionDataUtils::clone(srcDbData->tmCourseRoleList);
	destDbData->tmCourseRoleIndex = std::make_shared<TmCourseRoleIndex>(destDbData->tmCourseRoleList);

	destDbData->tmCourseRoleBaseList = TransactionDataUtils::clone(srcDbData->tmCourseRoleBaseList);
	destDbData->tmCourseRoleBaseIndex = std::make_shared<TmCourseRoleBaseIndex>(destDbData->tmCourseRoleBaseList);

	destDbData->tmCourseRoleQualList = TransactionDataUtils::clone(srcDbData->tmCourseRoleQualList);
	destDbData->tmCourseRoleQualIndex = std::make_shared<TmCourseRoleQualIndex>(destDbData->tmCourseRoleQualList);

	destDbData->tmCourseRoleDeviceList = TransactionDataUtils::clone(srcDbData->tmCourseRoleDeviceList);
	destDbData->tmCourseRoleDeviceIndex = std::make_shared<TmCourseRoleDeviceIndex>(destDbData->tmCourseRoleDeviceList);

	destDbData->tmFootprintList = TransactionDataUtils::clone(srcDbData->tmFootprintList);
	destDbData->tmFootprintIndex = std::make_shared<TmFootprintIndex>(destDbData->tmFootprintList);

	destDbData->tmFootprintCourseList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseList);
	destDbData->tmFootprintCourseIndex = std::make_shared<TmFootprintCourseIndex>(destDbData->tmFootprintCourseList);

	destDbData->tmFootprintCourseTraineeList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseTraineeList);
	destDbData->tmFootprintCourseTraineeIndex = std::make_shared<TmFootprintCourseTraineeIndex>(destDbData->tmFootprintCourseTraineeList);

	destDbData->tmFootprintCourseSectorList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseSectorList);
	destDbData->tmFootprintCourseSectorIndex = std::make_shared<TmFootprintCourseSectorIndex>(destDbData->tmFootprintCourseSectorList);

	destDbData->tmFootprintCourseIpRoleList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseIpRoleList);
	destDbData->tmFootprintCourseIpRoleIndex = std::make_shared<TmFootprintCourseIpRoleIndex>(destDbData->tmFootprintCourseIpRoleList);

	destDbData->tmFootprintCourseIpRoleBaseList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseIpRoleBaseList);
	destDbData->tmFootprintCourseIpRoleBaseIndex = std::make_shared<TmFootprintCourseIpRoleBaseIndex>(destDbData->tmFootprintCourseIpRoleBaseList);

	destDbData->tmFootprintCourseIpRoleQualList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseIpRoleQualList);
	destDbData->tmFootprintCourseIpRoleQualIndex = std::make_shared<TmFootprintCourseIpRoleQualIndex>(destDbData->tmFootprintCourseIpRoleQualList);

	destDbData->tmFootprintCourseRoleList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseRoleList);
	destDbData->tmFootprintCourseRoleIndex = std::make_shared<TmFootprintCourseRoleIndex>(destDbData->tmFootprintCourseRoleList);

	destDbData->tmFootprintCourseRoleQualList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseRoleQualList);
	destDbData->tmFootprintCourseRoleQualIndex = std::make_shared<TmFootprintCourseRoleQualIndex>(destDbData->tmFootprintCourseRoleQualList);

	destDbData->tmFootprintCourseRoleLimitationList = TransactionDataUtils::clone(srcDbData->tmFootprintCourseRoleLimitationList);
	destDbData->tmFootprintCourseRoleLimitationIndex = std::make_shared<TmFootprintCourseRoleLimitationIndex>(destDbData->tmFootprintCourseRoleLimitationList);

	destDbData->tmProgramList = TransactionDataUtils::clone(srcDbData->tmProgramList);
	destDbData->tmProgramIndex = std::make_shared<TmProgramIndex>(destDbData->tmProgramList);

	destDbData->tmProgramBuddyList = TransactionDataUtils::clone(srcDbData->tmProgramBuddyList);
	destDbData->tmProgramBuddyIndex = std::make_shared<TmProgramBuddyIndex>(destDbData->tmProgramBuddyList);

	destDbData->tmProgramBuddyTimeList = TransactionDataUtils::clone(srcDbData->tmProgramBuddyTimeList);
	destDbData->tmProgramBuddyTimeIndex = std::make_shared<TmProgramBuddyTimeIndex>(destDbData->tmProgramBuddyTimeList);

	destDbData->tmProgramBuddyCourseList = TransactionDataUtils::clone(srcDbData->tmProgramBuddyCourseList);
	destDbData->tmProgramBuddyCourseIndex = std::make_shared<TmProgramBuddyCourseIndex>(destDbData->tmProgramBuddyCourseList);

	destDbData->tmProgramPipList = TransactionDataUtils::clone(srcDbData->tmProgramPipList);
	destDbData->tmProgramPipIndex = std::make_shared<TmProgramPipIndex>(destDbData->tmProgramPipList);

	destDbData->tmProgramCourseMap = TransactionDataUtils::clone(srcDbData->tmProgramCourseMap);
	destDbData->tmProgramCourseIndex = std::make_shared<TmProgramCourseIndex>(destDbData->tmProgramCourseMap);

	destDbData->tmProgramCourseInstructorMap = TransactionDataUtils::clone(srcDbData->tmProgramCourseInstructorMap);
	destDbData->tmProgramCourseInstructorIndex = std::make_shared<TmProgramCourseInstructorIndex>(destDbData->tmProgramCourseInstructorMap);

	destDbData->tmProgramCourseLimitationList = TransactionDataUtils::clone(srcDbData->tmProgramCourseLimitationList);
	destDbData->tmProgramCourseLimitationIndex = std::make_shared<TmProgramCourseLimitationIndex>(destDbData->tmProgramCourseLimitationList);

	destDbData->tmProgramCourseIpRelevanceList = TransactionDataUtils::clone(srcDbData->tmProgramCourseIpRelevanceList);
	destDbData->tmProgramCourseIpRelevanceIndex = std::make_shared<TmProgramCourseIpRelevanceIndex>(destDbData->tmProgramCourseIpRelevanceList);

	destDbData->tmProgramCourseRoleList = TransactionDataUtils::clone(srcDbData->tmProgramCourseRoleList);
	destDbData->tmProgramCourseRoleIndex = std::make_shared<TmProgramCourseRoleIndex>(destDbData->tmProgramCourseRoleList);

	destDbData->tmProgramCourseRoleQualList = TransactionDataUtils::clone(srcDbData->tmProgramCourseRoleQualList);
	destDbData->tmProgramCourseRoleQualIndex = std::make_shared<TmProgramCourseRoleQualIndex>(destDbData->tmProgramCourseRoleQualList);

	destDbData->tmProgramCourseRoleLimitationList = TransactionDataUtils::clone(srcDbData->tmProgramCourseRoleLimitationList);
	destDbData->tmProgramCourseRoleLimitationIndex = std::make_shared<TmProgramCourseRoleLimitationIndex>(destDbData->tmProgramCourseRoleLimitationList);

	destDbData->tmProgramCourseIpRoleList = TransactionDataUtils::clone(srcDbData->tmProgramCourseIpRoleList);
	destDbData->tmProgramCourseIpRoleIndex = std::make_shared<TmProgramCourseIpRoleIndex>(destDbData->tmProgramCourseIpRoleList);

	destDbData->tmProgramCourseIpRoleBaseList = TransactionDataUtils::clone(srcDbData->tmProgramCourseIpRoleBaseList);
	destDbData->tmProgramCourseIpRoleBaseIndex = std::make_shared<TmProgramCourseIpRoleBaseIndex>(destDbData->tmProgramCourseIpRoleBaseList);

	destDbData->tmProgramCourseIpRoleQualList = TransactionDataUtils::clone(srcDbData->tmProgramCourseIpRoleQualList);
	destDbData->tmProgramCourseIpRoleQualIndex = std::make_shared<TmProgramCourseIpRoleQualIndex>(destDbData->tmProgramCourseIpRoleQualList);

	destDbData->tmProgramCoursePnrList = TransactionDataUtils::clone(srcDbData->tmProgramCoursePnrList);
	destDbData->tmProgramCoursePnrIndex = std::make_shared<TmProgramCoursePnrIndex>(destDbData->tmProgramCoursePnrList);

	destDbData->tmProgramCourseIpckList = TransactionDataUtils::clone(srcDbData->tmProgramCourseIpckList);
	destDbData->tmProgramCourseIpckIndex = std::make_shared<TmProgramCourseIpckIndex>(destDbData->tmProgramCourseIpckList);

	destDbData->tmProgramCourseMoreList = TransactionDataUtils::clone(srcDbData->tmProgramCourseMoreList);
	destDbData->tmProgramCourseMoreIndex = std::make_shared<TmProgramCourseMoreIndex>(destDbData->tmProgramCourseMoreList);

	destDbData->tmProgramCourseMoreLegList = TransactionDataUtils::clone(srcDbData->tmProgramCourseMoreLegList);
	destDbData->tmProgramCourseMoreLegIndex = std::make_shared<TmProgramCourseMoreLegIndex>(destDbData->tmProgramCourseMoreLegList);

	destDbData->tmDeviceList = TransactionDataUtils::clone(srcDbData->tmDeviceList);
	destDbData->tmDeviceMap.clear();
	for (auto& tmDevice : destDbData->tmDeviceList) {
		destDbData->tmDeviceMap.insert(make_pair(tmDevice->resourceCode, tmDevice));
	}

	destDbData->tmDeviceTimeList = TransactionDataUtils::clone(srcDbData->tmDeviceTimeList);
	destDbData->tmDeviceTimeIndex = std::make_shared<TmDeviceTimeIndex>(destDbData->tmDeviceTimeList, destDbData.get());

	destDbData->tmPairingChartList = TransactionDataUtils::clone(srcDbData->tmPairingChartList);
	destDbData->tmPairingChartIndex = std::make_shared<TmPairingChartIndex>(destDbData->tmPairingChartList);

	destDbData->tmPairingChartRoleList = TransactionDataUtils::clone(srcDbData->tmPairingChartRoleList);
	destDbData->tmPairingChartRoleIndex = std::make_shared<TmPairingChartRoleIndex>(destDbData->tmPairingChartRoleList);

	destDbData->tmPairingChartRoleQualList = TransactionDataUtils::clone(srcDbData->tmPairingChartRoleQualList);
	destDbData->tmPairingChartRoleQualIndex = std::make_shared<TmPairingChartRoleQualIndex>(destDbData->tmPairingChartRoleQualList);

	destDbData->tmPairingChartCourseList = TransactionDataUtils::clone(srcDbData->tmPairingChartCourseList);
	destDbData->tmPairingChartCourseIndex = std::make_shared<TmPairingChartCourseIndex>(destDbData->tmPairingChartCourseList);

	//步骤9：其他 - CA 特殊处理
	//FOR CA INT ADD BY CJ START 
	destDbData->crewIdToFltNumToCountForCA_INT = srcDbData->crewIdToFltNumToCountForCA_INT;
	destDbData->numHistoryFlyFlightsOnCrew = srcDbData->numHistoryFlyFlightsOnCrew;
	destDbData->studentsInfoForPreLockTeacherVec = TransactionDataUtils::clone(srcDbData->studentsInfoForPreLockTeacherVec);  //TODO 需要深度复制，已处理
	destDbData->historyTeachingHoursForCACCInitialTeachingVec = TransactionDataUtils::clone(srcDbData->historyTeachingHoursForCACCInitialTeachingVec);  //TODO 需要深度复制，已处理
	destDbData->crewHasTeachingTaskInLastPeriod = srcDbData->crewHasTeachingTaskInLastPeriod;
	destDbData->crewIdToNumEachMonthHistoryFlyPairingForCA_INT = srcDbData->crewIdToNumEachMonthHistoryFlyPairingForCA_INT;
	destDbData->crewIdToEachMonthFlyHoursOnCrewForCA_INT = srcDbData->crewIdToEachMonthFlyHoursOnCrewForCA_INT;
	//FOR CA INT ADD BY CJ END

	//dbg ca_train start
	destDbData->crewIdToStartAndEndTime = srcDbData->crewIdToStartAndEndTime;
	destDbData->caccTeachingHistoryDetailsOfStudent = TransactionDataUtils::clone(srcDbData->caccTeachingHistoryDetailsOfStudent);  //TODO 需要深度复制，已处理
	//dbg ca_train end

	//for cacc pairing start
	destDbData->koreaAndJapanExpatFlightToCompIdToCount = srcDbData->koreaAndJapanExpatFlightToCompIdToCount;
	//for cacc pairing end
	//for ak teaching start
	destDbData->crewIdToPhaseToPeriodsForAK = srcDbData->crewIdToPhaseToPeriodsForAK;
	//for ak teaching end

	//6001 Cache
	//destDbData->_helper6001Cache = srcDbData->_helper6001Cache;
	//destDbData->_needPreAssignCache = srcDbData->_needPreAssignCache;
	//destDbData->_crewIdToRDOParamCache = srcDbData->_crewIdToRDOParamCache;
	//6001 在非RO场景时，改成仅加载当前crew的缓存，不在需要复制，并且需要重新计算
	destDbData->_needPreAssignCache = true;

	//法规服务化事务临时保存的crewList
	//for (auto& crew : destDbData->crewList) {
	//	destDbData->_transactionCrewIdMap.insert(std::pair(crew->idCrew, std::make_tuple(crew->rosterList, crew->mandayFdList, crew->mandayCcAmList)));
	//}

	destDbData->crewMonthMandayList = TransactionDataUtils::clone(srcDbData->crewMonthMandayList);

	destDbData->crewRpRecencyList = TransactionDataUtils::clone(srcDbData->crewRpRecencyList);
	destDbData->crewRpRecencyIndex = std::make_shared<CrewRpRecencyIndex>(destDbData.get());

	destDbData->dutyCodeLogicList = TransactionDataUtils::clone(srcDbData->dutyCodeLogicList);
	destDbData->dutyCodeTypeCompList = TransactionDataUtils::clone(srcDbData->dutyCodeTypeCompList);
	destDbData->dutyCodeLogicMap = makeDutyCodeLogicMap(srcDbData->dutyCodeLogicList);

	//destDbData->_isRequestScope = srcDbData->_isRequestScope; 接口调用时设置，这里不在设置
	//destDbData->_isServiceMode = srcDbData->_isServiceMode; 接口调用时设置，这里不在设置

	destDbData->_dataError = std::make_shared<DataError>(*srcDbData->_dataError);
	Logger::getRuleLogger()->debug("[CrewDataContext] copy end");
}

void CrewDataContext::recreate(const set<string>& changedCrewIds, const set<long long>& changedPairingIds) {
	//printDebugRosterPairing("[recreate] start info:", this);
	vector<std::shared_ptr<CREW>> tmpCrewList;
	//移除需要更新的Crew，并将移除Crew存储到tmpCrewList
	this->crewList.erase(std::remove_if(this->crewList.begin(), this->crewList.end(),
		[changedCrewIds, &tmpCrewList](const auto& destCrew) {
			if (changedCrewIds.find(destCrew->idCrew) != changedCrewIds.end()) {
				tmpCrewList.emplace_back(destCrew);
				return true;
			}
			return false;
		}), this->crewList.end());

	//获得更新的rosterId、pairingId、flightId
	set<long long> updatedPairingIds, updatedRosterIds, updatedFlightIds;
	updatedPairingIds.insert(changedPairingIds.begin(), changedPairingIds.end());
	for (auto& crew : tmpCrewList) {
		for (auto& roster : crew->rosterList) {
			updatedRosterIds.emplace(roster->rosterId);
			if (roster->pairing != nullptr) {
				updatedPairingIds.emplace(roster->pairId);
				for (auto& segment : roster->pairing->getSegmentsRead()) {
					updatedFlightIds.emplace(segment->getDBId());
				}
			}
		}
	}

	//深度复制Crew
	tmpCrewList = TransactionDataUtils::clone(tmpCrewList, *this);
	this->crewList.insert(this->crewList.begin(), tmpCrewList.begin(), tmpCrewList.end());
	for (auto& crew : tmpCrewList) {
		this->crewIdMap[crew->idCrew] = crew;
	}

	this->crewTotalList.erase(std::remove_if(this->crewTotalList.begin(), this->crewTotalList.end(),
		[changedCrewIds](const auto& destCrew) {
			return (changedCrewIds.find(destCrew->idCrew) != changedCrewIds.end());
		}), this->crewTotalList.end());
	this->crewTotalList.insert(this->crewTotalList.begin(), tmpCrewList.begin(), tmpCrewList.end());
	makeIndexCrewBaseRankFleet(this, changedCrewIds); //创建 crew->index  索引
	makeIndexCrewKpiAdjust(this, changedCrewIds);//创建 crewKpiAdjust->index  索引

	//深度复制：Pairing、Duty和Segment相关克隆
	vector<Pairing*> tmpPairingList;
	this->pairingList.erase(std::remove_if(this->pairingList.begin(), this->pairingList.end(),
		[&updatedPairingIds, &tmpPairingList](const auto& destPairing) {
			if (updatedPairingIds.find(destPairing->getDbId()) != updatedPairingIds.end()) {
				tmpPairingList.emplace_back(destPairing);
				return true;
			}
			return false;
		}), this->pairingList.end());
	removePairingLabelMapIndex(tmpPairingList, this->pairingLabelMap);

	tmpPairingList = TransactionDataUtils::clone(tmpPairingList);//pairing全集，包括场景条件筛选、预占 //TODO 需要深度复制， _segments、_flySegments、_mandayTimesFDP、_mandayTimesOther 不需要复制，复制包括：Pairing._dutyVec（Duty和Segment） 已处理
	this->pairingList.insert(this->pairingList.begin(), tmpPairingList.begin(), tmpPairingList.end());
	for (auto& p : tmpPairingList) {
		this->pairingIdMap[p->getDbId()] = p;
	}
	makePairingLabelMapIndex(tmpPairingList, this->pairingLabelMap);

	//深度复制：航班相关克隆
	vector<std::shared_ptr<Segment>> tmpFlightList;
	this->flightList.erase(std::remove_if(this->flightList.begin(), this->flightList.end(),
		[&updatedFlightIds, &tmpFlightList](const auto& destFlight) {
			if (updatedFlightIds.find(destFlight->getDBId()) != updatedFlightIds.end()) {
				tmpFlightList.emplace_back(destFlight);
				return true;
			}
			return false;
		}), this->flightList.end());
	tmpFlightList = TransactionDataUtils::clone(tmpFlightList);
	this->flightList.insert(this->flightList.begin(), tmpFlightList.begin(), tmpFlightList.end());
	for (auto& flight : tmpFlightList) {
		this->flightIdMap[flight->getDBId()] = flight;
	}

	//深度复制crewOnPairing
	for (auto updatedPairingId : updatedPairingIds) {
		auto iter = this->crewOnPairing.find(updatedPairingId);
		if (iter == this->crewOnPairing.end()) {
			continue;
		}
		auto list = TransactionDataUtils::clone(iter->second, *this);
		this->crewOnPairing[iter->first] = list;
	}
	
	//深度复制crewOnFlt
	for (auto updatedFlightId : updatedFlightIds) {
		auto iter = this->crewOnFlt.find(updatedFlightId);
		if (iter == this->crewOnFlt.end()) {
			continue;
		}
		auto list = TransactionDataUtils::clone(iter->second, *this);// key:pairingId, value:crewId list //TODO 需要深度复制, CrewOnFlight.Crew需要处理 已处理
		this->crewOnFlt[iter->first] = list;
	}

	vector<std::shared_ptr<ROSTER>> tmpRosterList;
	//移除需要更新的Roster，并将移除Roster存储到tmpRosterList
	this->rosterList.erase(std::remove_if(this->rosterList.begin(), this->rosterList.end(),
		[&updatedRosterIds, &tmpRosterList](const auto& destRoster) {
			if (updatedRosterIds.find(destRoster->rosterId) != updatedRosterIds.end()) {
				tmpRosterList.emplace_back(destRoster);
				return true;
			}
			return false;
		}), this->rosterList.end());
	tmpRosterList = TransactionDataUtils::clone(tmpRosterList, *this);//TODO 需要深度复制， 已处理
	this->rosterList.insert(this->rosterList.begin(), tmpRosterList.begin(), tmpRosterList.end());
	//index crew->roster
	for (auto& roster : tmpRosterList) {
		auto& crew = this->crewIdMap[roster->idcrew];
		if (crew != nullptr) {
			crew->rosterList.push_back(roster);
		}
	}
	//sort crew.rosterList
	for (auto& crewId : changedCrewIds) {
		auto iter = this->crewIdMap.find(crewId);
		if (iter != this->crewIdMap.end()) {
			auto& crew = iter->second;
			std::stable_sort(crew->rosterList.begin(), crew->rosterList.end(), compareRosterByStartDT);

		}
	}

	//深度复制mergeRosterFlight、rosterFlightMgr
	for (auto updatedRosterId : updatedRosterIds) {
		auto iter = this->mergeRosterFlight.find(updatedRosterId);
		if (iter == this->mergeRosterFlight.end()) {
			continue;
		}
		auto list = TransactionDataUtils::clone(iter->second);//TODO 需要深度复制 已处理
		this->mergeRosterFlight[iter->first] = list;
		this->rosterFlightMgr.add(list);//删除rosterFlightMgr的crewIndex、flightIndex、pairingIndex后，重新创建
	}
	//printDebugRosterPairing("[recreate] end info:", this);
}

void CrewDataContext::init(string applicationType) {
	int ret = 0;
	// std::cout << "4.init()" << std::endl;
	Logger::getRuleLogger()->info("constructing CrewDataContext...");
	scenarioId = 0;
	startUtc = 0;
	endUtc = 0;
	this->applicationType = applicationType;
	this->tempIdGenerator.store(-1);
	this->leadinScenarioId = -1;
	this->_is8091AlwaysResetSeqOrder = false;

	//matnis#1470, 按exe类型决定data source配置文件
	//读取配置文件 
	//OR: Database_connections.txt
	//RuleSrv: RuleServiceConnection.txt
	DATA_SOURCE_CONFIG& config = DATA_SOURCE_CONFIG::getInstance();
	if (config.configBy == DATA_SOURCE_CONFIG::FILE) {
		if (applicationType == CREW_APP_TYPE_OR) {
			ret = loadDatabaseConnectionConfig(config);
			if (ret != 0)
				Logger::getRuleLogger()->info("ERROR: load config 'Database_connection.txt' fail");
		}
		else if (applicationType == CREW_APP_TYPE_RULESRV) {
			ret = loadRuleSrvConfig(config);
			if (ret != 0)
				Logger::getRuleLogger()->info("ERROR: load config 'RuleServiceConfig.txt' fail");
		}
		else {
			Logger::getRuleLogger()->error("[init] invalid param, CrewDataContext::CrewDataContext() type={}", applicationType);
			return;
		}
	}
	configDataSource = config.dataSourceType;
	configDataSourceUrl = config.url;

	mandayForRosterCalculator = NULL;

	//db connection
	if (configDataSource == "db") {
		//this->dbCtx = PairingDBContext::getDbConnection();
		//this->dbCtx->init(config.url.c_str(), config.user.c_str(), config.password.c_str());
	}

	this->_dataError = std::make_shared<DataError>();

}


/*每次请求必须重置数据*/
void CrewDataContext::reset() {
	//每次都需要更新是否是 is8091AlwaysResetSeqOrder流程 用于8091
	this->_is8091AlwaysResetSeqOrder = false;
}

//析构时释放裸指针缓冲
CrewDataContext::~CrewDataContext() {
	Logger::getRuleLogger()->info("destructing CrewDataContext...");
	map<Pairing*, long long> pairingIdMap; //防止duplicate delete
	FILE * logfile = NULL;

	//释放DB连接对象引用
	//if (this->configDataSource == "db") {
	//	this->dbCtx = NULL;
	//}

	//单独log文件保存 dup pairing信息，避免影响主log可读性
	//logfile = fopen("ro_err_duplicate_pairing.txt", "w");

	//释放全集 pairingList占用内存，包括三级 pairing/duty/seg
	if (this->_isRequestScope) {
		if (this->_requestTransactionId.empty() || (!this->_requestTransactionId.empty() && this->_requestTransactionStatus == "CLOSE")) {
			set<long long> releasePairingIds = this->_requestRoster.changedPairingIds; //需要单独释放内存Pairing
			set<long long> releasedPairingIds; //已经被释放内存的Pairing
			//Logger::getRuleLogger()->debug("[~CrewDataContext] release pairing mode:server");
			//stringstream ss;
			//ss << "[~CrewDataContext] info: ";
			for (auto& crewId : this->_requestRoster.changedCrewIds) {
				auto iter = this->crewIdMap.find(crewId);
				if (iter != this->crewIdMap.end()) {
					for (auto& roster : iter->second->rosterList) {
						if (releasedPairingIds.find(roster->pairId) != releasedPairingIds.end()) {
							continue;
						}
						Pairing* p = roster->pairing;
						if (p != nullptr) {
							releasePairingIds.erase(p->getDbId());
							releasedPairingIds.emplace(p->getDbId());
							//delete p;
							//ss << "pairingId(0x" << std::hex << std::setw(sizeof(void*) * 2) << std::setfill('0') << reinterpret_cast<uintptr_t>(p) << "): " << std::dec
							//	<< p->getDbId() << ", dutySize = " << p->getDutyVec().size() << ";";
							deletePairingDutySeg(p);//20180423 ain, mantis#3189, delete pairing/duty/seg
						}
					}
				}
			}

			for (auto pairingId : releasePairingIds) {
				auto iter = this->pairingIdMap.find(pairingId);
				if (iter != this->pairingIdMap.end()) {
					auto& p = iter->second;
					//ss << "pairingId(0x" << std::hex << std::setw(sizeof(void*) * 2) << std::setfill('0') << reinterpret_cast<uintptr_t>(p) << "): " << std::dec
					//	<< p->getDbId() << ", dutySize = " <<p->getDutyVec().size() << ";";
					deletePairingDutySeg(p);
				}
			}
			//Logger::getRuleLogger()->debug(ss.str());
		}
	}
	else {
		//Logger::getRuleLogger()->debug("[~CrewDataContext] release pairing mode:no server");
		for (std::size_t i = 0; i < pairingList.size(); i++) {
			Pairing* p = pairingList[i];
			//delete p;
			deletePairingDutySeg(p);//20180423 ain, mantis#3189, delete pairing/duty/seg
		}
	}
	pairingList.clear();
	pairingListForROWithOpenComposition.clear();

	//flightList
	//for (Segment* flt : flightList) {
	//	delete flt;
	//	flt = NULL;
	//}
	flightList.clear();

	//mantis#5183, clear mem leak
	for (auto& item : pairingInputFerrys) {
		delete item;
	}
	pairingInputFerrys.clear();
}

//按配置文件从DB或csv server写入结果
int CrewDataContext::saveRo() {

	int ret = 0;
	bool success = 0;
	time_t startLoc = 0;
	time_t endLoc = 0;

	//根据 database_connections.txt配置确定从哪里读取数据：db或server
#ifdef WIN32
	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[saveRo] DataSource=DB not supported any more.");
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		ret = this->saveRoCsv(RO_OUTPUT_FILE);
		if (ret != 0)
			return ret;
		ret = this->saveDataToHttpServer(RO_OUTPUT_FILE);
		if (ret != 0)
			return ret;
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		ret = this->saveRoCsv(RO_OUTPUT_FILE);
	}
#else
	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[saveRo] DataSource=DB not supported any more.");
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		ret = this->saveRoCsv(RO_OUTPUT_FILE);
		if (ret != 0)
			return ret;
		ret = this->saveDataToHttpServer(RO_OUTPUT_FILE);
		if (ret != 0)
			return ret;
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		ret = this->saveRoCsv(RO_OUTPUT_FILE);
	}
#endif
	else {
		Logger::getRuleLogger()->error("[saveRo] invalid config, data_source={}", this->configDataSource);
	}
	return ret;
}

int CrewDataContext::saveTo(std::vector<Pairing*> &pairings){
	int ret = 0;
	bool success = 0;
	time_t startLoc = 0;
	time_t endLoc = 0;

	//根据 database_connections.txt配置确定从哪里读取数据：db或server
	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[saveTo] DataSource=DB not supported any more.");
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		ret = this->saveToCsv(TO_OUTPUT_FILE, pairings);
		if (ret != 0)
			return ret;
		ret = this->saveToDataToHttpServer(TO_OUTPUT_FILE);
		if (ret != 0)
			return ret;
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		ret = this->saveToCsv(TO_OUTPUT_FILE, pairings);
	}
	else {
		Logger::getRuleLogger()->error("[saveRo] invalid config, data_source={}", this->configDataSource);
	}
	return ret;
}

int CrewDataContext::saveManday(const unordered_map<long long, std::shared_ptr<ROSTER>>& orgRosterMap) {
	int ret = 0;
	bool success = false;
	time_t startDtLoc = 0;
	time_t endDtLoc = 0;

	startDtLoc = utcToLocal(this->startUtc);
	endDtLoc = utcToLocal(this->endUtc);
	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[saveManday] DataSource=DB not supported any more.");
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		ret = this->saveMandayCsv("ro_manday_output.txt", startDtLoc, endDtLoc, orgRosterMap);
		if (ret != 0)
			return ret;
		//20181018 ain, mantis#4295, 按crewList.division汇总manday保存方式, 支持一次同时保存CC/FD
		bool hasCC = false;
		bool hasFD = false;
		for (auto& crew : crewList) {
			if (crew->division == "P") hasFD = true;
			else hasCC = true;
		}
		string url = "/api/crewManday/partlySave/csv/comp";//默认同时保存CC/FD
		if (hasCC && !hasFD)
			url = "/api/crewMandayCcAm/partlySave/csv/comp";
		else if (!hasCC && hasFD)
			url = "/api/crewMandayFd/partlySave/csv/comp";
		ret = this->saveDataToHttpServer("ro_manday_output.txt", url);
		if (ret != 0)
			return ret;
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		ret = this->saveMandayCsv("ro_manday_output.txt", startDtLoc, endDtLoc, orgRosterMap);
		if (ret != 0)
			return ret;
	}
	else {
		Logger::getRuleLogger()->error("[saveManday] invalid config, data_source={}", this->configDataSource);
	}

	return ret;
}
//20190914 ain, OP#2279, 重算历史号位
int CrewDataContext::saveSeqOrder() {
	int ret = 0;
	bool success = false;
	time_t startDtLoc = 0;
	time_t endDtLoc = 0;
	const char* FILENAME = "ro_output_seqOrder.txt";

	startDtLoc = utcToLocal(this->startUtc);
	endDtLoc = utcToLocal(this->endUtc);
	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->info("ERROR: config=DB not supported\n");
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		ret = this->saveRosterFlightCsv(FILENAME, startDtLoc, endDtLoc);
		if (ret != 0)
			return ret;
		
		string url = "/api/rosterFlight/seqOrder/csv/comp";
		ret = this->saveDataToHttpServer(FILENAME, url);
		if (ret != 0)
			return ret;
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		ret = this->saveRosterFlightCsv(FILENAME, startDtLoc, endDtLoc);
		if (ret != 0)
			return ret;
	}
	else {
		Logger::getRuleLogger()->error("[saveSeqOrder] invalid config, data_source={}", this->configDataSource);
	}
	return SUCCESS;//mantis#6713, 补齐全部逻辑分支都有return
}

int CrewDataContext::saveRecency() {
	int ret = 0;
	bool success = false;
	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[saveRecency] DataSource=DB not supported any more.");
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		ret = this->saveRecencyCsv(RO_OUTPUT_FILE);
		if (ret != 0)
			return ret;
		string url = "/api/crewRecency/save/csv/comp";
		ret = this->saveDataToHttpServer(RO_OUTPUT_FILE, url);
		if (ret != 0)
			return ret;
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		ret = this->saveRecencyCsv(RO_OUTPUT_FILE);
		if (ret != 0)
			return ret;
	}
	else {
		Logger::getRuleLogger()->error("[saveRecency] invalid config, data_source={}", this->configDataSource);
	}
	return 0;
}

int CrewDataContext::saveFlightChange(vector<long long>& flightIds) {

	int ret = 0;
	bool success = false;
	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[saveFlightChange] invalid config, not support for saveReCalculatePairingRosterManday, data_source={}", this->configDataSource);
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		ret = this->saveFlightChange(RO_OUTPUT_FILE, flightIds);
		if (ret != 0)
			return ret;
		string url = "/api/orengine/byFlight/save/csv";
		ret = this->saveDataToHttpServer(RO_OUTPUT_FILE, url);
		if (ret != 0)
			return ret;
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		ret = this->saveFlightChange(RO_OUTPUT_FILE, flightIds);
		if (ret != 0)
			return ret;
	}
	else {
		Logger::getRuleLogger()->error("[saveFlightChange] invalid config, data_source={}", this->configDataSource);
	}
	return 0;
}

int CrewDataContext::saveRosterDP() {

	int ret = 0;
	bool success = false;
	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[refreshRosterDP] invalid config, not support for refreshRosterDP, data_source={}", this->configDataSource);
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		ret = this->saveRefreshDP(RO_OUTPUT_FILE);
		if (ret != 0)
			return ret;
		string url = "/api/orengine/byFlight/save/csv";
		ret = this->saveDataToHttpServer(RO_OUTPUT_FILE, url);
		if (ret != 0)
			return ret;
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		ret = this->saveRefreshDP(RO_OUTPUT_FILE);
		if (ret != 0)
			return ret;
	}
	else {
		Logger::getRuleLogger()->error("[refreshRosterDP] invalid config, data_source={}", this->configDataSource);
	}
	return 0;
}

int CrewDataContext::savePairingTag() {
	int ret = 0;
	bool success = false;
	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[savePairingTag] invalid config, not support for savePairingTag, data_source={}", this->configDataSource);
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		ret = this->savePairingTagChange(RO_OUTPUT_FILE);
		if (ret != 0)
			return ret;
		string url = "/api/orengine/byPairing/save/csv";
		ret = this->saveDataToHttpServer(RO_OUTPUT_FILE, url);
		if (ret != 0)
			return ret;
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		ret = this->savePairingTagChange(RO_OUTPUT_FILE);
		if (ret != 0)
			return ret;
	}
	else {
		Logger::getRuleLogger()->error("[savePairingTag] invalid config, data_source={}", this->configDataSource);
	}
	return 0;
}

//按配置文件从DB或csv server读取输入
//时间按参数筛选，其他按场景条件筛选
//若参数 int=0/string=""表示本参数不指定, 按原始scenario数据为准
int CrewDataContext::loadData(long long scenarioId, time_t startDtLoc, time_t endDtLoc, long long ruleSet, string baseIds, string rankIds, string fleetIds, string division) {
	bool needPreAssign = true;
	bool loadScen_0 = false;

	//根据 database_connections.txt配置确定从哪里读取数据：db或server
	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[loadData] DataSource=DB not supported any more.");
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		return this->loadDataFromHttpServer(scenarioId, startDtLoc, endDtLoc, ruleSet, baseIds, rankIds, fleetIds, division);
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		return this->loadDataCsv(RO_INPUT_FILE);
	}
	else {
		Logger::getRuleLogger()->error("[loadData] invalid config, data_source={}", this->configDataSource);
	}
	return -1;
}

int CrewDataContext::loadDataByFlight(long long scenarioId, vector<long long>& flightIds, string filiale, string division) {

	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[loadDataByFlight] invalid config, load data by pairing NOT support data_source=DB");
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		return this->loadDataByFlightFromHttpServer(scenarioId, flightIds, filiale, division);
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		return this->loadDataCsv(RO_INPUT_FILE);
	}
	else {
		Logger::getRuleLogger()->error("[loadDataByFlight] invalid config, data_source={}", this->configDataSource);
	}
	return -1;
}
int CrewDataContext::loadDataByPairing(long long scenarioId, vector<long long>& pairingIds) {

	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[loadDataByPairing] invalid config, load data by pairing NOT support data_source=DB");
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		return this->loadDataByPairingFromHttpServer(scenarioId, pairingIds);
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		return this->loadDataCsv(RO_INPUT_FILE);
	}
	else {
		Logger::getRuleLogger()->error("[loadDataByPairing] invalid config, data_source={}", this->configDataSource);
	}
	return -1;
}

int CrewDataContext::loadDataByCrew(long long scenarioId, vector<string>& crewIds, time_t startDt, time_t endDt) {

	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[loadDataByCrew] invalid config, load data by crew NOT support data_source=DB");
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		return this->loadDataByCrewFromHttpServer(scenarioId, crewIds, startDt, endDt);
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		return this->loadDataCsv(RO_INPUT_FILE);
	}
	else {
		Logger::getRuleLogger()->error("[loadDataByCrew] invalid config, data_source={}", this->configDataSource);
	}
	return -1;
}

//按配置文件从DB或csv server读取输入
//完全按场景条件筛选
int CrewDataContext::loadData(long long scenarioId, string loginUser) {
	bool needPreAssign = this->applicationType == CREW_APP_TYPE_OR ? true : false;

	//根据 database_connections.txt配置确定从哪里读取数据：db或server
	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[loadData] DataSource=DB not supported any more.");
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		return this->loadDataFromHttpServer(scenarioId, loginUser);
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		return this->loadDataCsv(RO_INPUT_FILE);
	}
	else {
		Logger::getRuleLogger()->error("[loadData] invalid config, data_source={}", this->configDataSource);
	}
	return -1;
}

int CrewDataContext::loadDataTO(long long scenarioId, string loginUser) {
	bool needPreAssign = this->applicationType == CREW_APP_TYPE_OR ? true : false;

	//根据 database_connections.txt配置确定从哪里读取数据：db或server
	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[loadData] DataSource=DB not supported any more.");
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		return this->loadDataFromHttpServerTO(scenarioId, loginUser);
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		return this->loadDataCsv(TO_INPUT_FILE);
	}
	else {
		Logger::getRuleLogger()->error("[loadData] invalid config, data_source={}", this->configDataSource);
	}
	return -1;
}

int CrewDataContext::loadScenarioIdGroup(long long parentScenarioId, vector<long long>& result) {

	int ret = 0;

	//根据 database_connections.txt配置确定从哪里读取数据：db或server
	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[loadScenarioIdGroup] DataSource=DB not supported any more.");
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		vector<string> crewIds;
		for (auto& c : crewList) {
			crewIds.push_back(c->idCrew);
		}
		return this->loadScenOfGrpFromHttpServer(parentScenarioId, result);
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		//20210719 ain, mantis#9388, 针对 ruleTool merge_group增加读取文件 csv_scen_grp.txt
		cout << "load scenarioIds file 'csv_scen_grp.txt'" << endl;

		ifstream in;
		string line;
		in.open("csv_scen_grp.txt");
		if (!in) {
			cout << "ERROR: config {data_source=file}, load 'csv_scen_grp.txt' fail" << endl;
			return -1;
		}
		in >> line;
		line = line.substr(1, line.length() - 2);
		split(line.c_str(), ',', result);
		in.close();
		
	}
	else {
		Logger::getRuleLogger()->error("[loadScenarioIdGroup] invalid config, data_source={}", this->configDataSource);
	}
	return ret;
}

int CrewDataContext::loadRoster(vector<long long>& scenarioIds, time_t startUtc, time_t endUtc, vector<SharedPtr<CREW>>& crewList) {
	int ret = 0;

	//根据 database_connections.txt配置确定从哪里读取数据：db或server
	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[loadRoster] DataSource=DB not supported any more.");
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		vector<string> crewIds;
		for (auto& c : crewList) {
			crewIds.push_back(c->idCrew);
		}
		//Non-PA from brother in grp
		vector<SharedPtr<ROSTER>> rostersInGrp;
		ret = this->loadRosterFromHttpServer(scenarioIds, startUtc, endUtc, crewIds, false, rostersInGrp);
		if (ret != 0) {
			Logger::getRuleLogger()->info("loadRosterFromHttpServer fail {}", ret);
			return ret;
		}
		Logger::getRuleLogger()->info("load {} roster in group", rostersInGrp.size());

		//PA from 0
		//vector<SharedPtr<ROSTER>> rosterPreAssign;
		//vector<int> scenIds2;
		//scenIds2.push_back(0);
		//ret = this->loadRosterFromHttpServer(scenIds2, startUtc, endUtc, crewIds, true, rosterPreAssign);
		//if (ret != 0) {
			//Logger::getRuleLogger()->info("loadRosterFromHttpServer fail {}", ret);
			//return ret;
		//}
		//Logger::getRuleLogger()->info("load {} roster in 0", rosterPreAssign.size());

		this->rosterList.clear();
		this->rosterList.insert(rosterList.end(), rostersInGrp.begin(), rostersInGrp.end());
		this->rosterList.insert(rosterList.end(), this->preAssignRosterGroundList.begin(), this->preAssignRosterGroundList.end());
		Logger::getRuleLogger()->info("load {} roster total", rosterList.size());
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		//20210719 ain, mantis#9388, 针对 ruleTool merge_group增加读取文件 csv_load_roster.%d.txt
		cout << "load rosters of brother scenario and preAssign from file 'csv_load_roster.x.txt'" << endl;

		char txtFile[100] = { 0 };// "ro_input.txt";
		vector<SharedPtr<ROSTER>> rostersInGrp;
		vector<SharedPtr<ROSTER>> rosterPreAssign;

		//rosters from brother scenario in same group
		_snprintf(txtFile, sizeof(txtFile) - 1, "csv_load_roster.%lld.txt", scenarioIds[0]);
		ret = this->loadRosterCsv((char*)txtFile, rostersInGrp);
		if (ret != 0) {
			Logger::getRuleLogger()->error("load file '{}' fail {}", txtFile, ret);
			return ret;
		}

		//preAssign from scenario 0
		_snprintf(txtFile, sizeof(txtFile) - 1, "csv_load_roster.%d.txt", 0);
		ret = this->loadRosterCsv((char*)txtFile, rostersInGrp);
		if (ret != 0) {
			Logger::getRuleLogger()->error("load file '{}' fail {}", txtFile, ret);
			return ret;
		}

		this->rosterList.clear();
		this->rosterList.insert(rosterList.end(), rostersInGrp.begin(), rostersInGrp.end());
		this->rosterList.insert(rosterList.end(), rosterPreAssign.begin(), rosterPreAssign.end());
		this->rosterList.insert(rosterList.end(), this->preAssignRosterGroundList.begin(), this->preAssignRosterGroundList.end());
		
	}
	else {
		Logger::getRuleLogger()->error("[loadRoster] invalid config, data_source={}", this->configDataSource);
	}
	return ret;
}

int CrewDataContext::updateScenarioState(long long scenarioId, string state) {
	int ret = 0;
	if (strToUpper(this->configDataSource) == "DB") {
		Logger::getRuleLogger()->error("[updateScenarioState] DataSource=DB not supported any more.");
	}
	else if (strToUpper(this->configDataSource) == "SERVER") {
		updateScenStatusByHttp(scenarioId, state);
	}
	else if (strToUpper(this->configDataSource) == "FILE") {
		cout << "ERROR: updateScenarioState not implemented for data_source=file" << endl;
	}
	else {
		Logger::getRuleLogger()->error("[updateScenarioState] invalid config, data_source={}", this->configDataSource);
	}
	return ret;
}

//add:增加Roster
//修改数据:crewOnFlt, rosterList, manday
SharedPtr<ROSTER> CrewDataContext::addRoster(ErrorContext * errCtx, SharedPtr<ROSTER>& roster, bool checkOverlap) {
	errCtx->errorCode = 0;
	int i = 0, j = 0, k = 0;
	auto iter = crewIdMap.find(roster->idcrew);
	if (iter == crewIdMap.end() || iter->second == nullptr) {
		Logger::getRuleLogger()->error("[DataCheck] invalid data, addRoster fail, roster.crewId {} not in scenario", roster->idcrew);
		return roster;
	}
	SharedPtr<CREW> crew = iter->second;
	for (auto iter = crew->rosterList.begin(); iter != crew->rosterList.end(); iter++) {
		if ((roster->pairId != 0 && iter->get()->pairId == roster->pairId) || (iter->get()->rosterId == roster->rosterId)) {
			Logger::getRuleLogger()->error("ERROR: invalid data, addRoster fail, crewId={} rosterId={} pairingId={} already exists.", roster->idcrew, roster->rosterId, roster->pairId);
			return roster;
		}
	}
	//检查roster是否已存在
	/*if (checkOverlap) {
		checkOverlapForRosterOnCrew(errCtx, this->overlapableAssignmentMap, roster, crew);
		if (errCtx->errorCode != 0) {
			Logger::getRuleLogger()->error("addRoster fail, {}", errCtx->errorMsgBuf);
			return NULL;
		}
	}*/
	Pairing * pairing = roster->pairing;
	if (pairing == NULL && pairingIdMap.find(roster->pairId) != pairingIdMap.end()) {
		roster->pairing = pairingIdMap[roster->pairId];
	}
	//total pay time
	roster->totalPayTime = static_cast<int>(calculatePairingPayTimeSecs(pairing)/60);//seconds -> min

	//新增地面任务打标签
	if (!roster->pairing) {
		GroundAttributeCalculator groundAttrCalc(this->scenario.airline, this->airportCodeMap, this->assignmentNameGroupMap, this->assignmentNameMap, this->tagCategoryList, this->tagRosterGroundGroupMap, this->tagGroupTableMap, this->tagGroupMap);
		vector<SharedPtr<ROSTER>> rosters;
		rosters.push_back(roster);
		groundAttrCalc.calculateAndSetGroundTag(rosters);
	}
	
	//按时间顺序找到对应位置并插入
	vector<SharedPtr<ROSTER>>::iterator insertPos;
	for (insertPos = crew->rosterList.begin(); insertPos != crew->rosterList.end(); insertPos++) {
		if (insertPos->get()->strUtc > roster->strUtc)
			break;
		else if (insertPos->get()->strUtc == roster->strUtc && insertPos->get()->restStrUtc > roster->restStrUtc) // mantis#5655
			break;
	}
	crew->rosterList.insert(insertPos, roster);
	crew->makeRosterValidity(roster);
	//刷新index
	refreshRosterIndexOfCrew(crew);

	//manday
	if (mandayForRosterCalculator != NULL && this->applicationType == CREW_APP_TYPE_OR) {
		mandayForRosterCalculator->reCalculateSingleRosterManday(crew, roster, true); //true for addRoster, false for delRoster
	}

	//recency
	//旧的recency逻辑，去掉
	//computeSingleRosterRecency(roster, this, this->scenarioId, "ROIS");

	//新增roster添加到this.rosterList列表中
	this->rosterList.emplace_back(roster);//添加roster到rosterList列表中
	//更新cof
	int ret = addCrewOnFlight(roster, this->crewOnFlt, this->crewIdMap);
	ret = addCrewOnPairing(roster->pairId, crew, roster, this->crewOnPairing);

	//rosterFlight
	string position;
	string activeRank;
	if (pairing) {
		for (auto & duty : pairing->getDutyVec()) {
			for (auto & seg : duty->getSegments()) {
				if (seg->getIsOperating()) {
					string acType = this->fleetMap[seg->getFleetCD()].acType;
					SharedPtr<CREW_RANK> crewRank = crew->getActiveRankInTimes(pairing->getStartTimeUtcAct(), pairing->getEndTimeUtcAct(), acType);
					if (crewRank){
						position = crewRank->position;
						activeRank = crewRank->rank;
					}
					break;
				}
			}
		}
		if (position.empty() && activeRank.empty()) {
			const auto &crewRank = crew->getActiveRankInTimes(pairing->getStartTimeUtcAct(), pairing->getEndTimeUtcAct(), "");
			if (crewRank){
				position = crewRank->position;
				activeRank = crewRank->rank;
			}
		}
	}
	
	if(this->getApplicationType() == "OR" && (this->scenario.category == "RO" || this->scenario.category == "TO"))
		this->rosterFlightMgr.addByPairingForRosterOptimizer(roster->idcrew, roster->rosterId, roster->idscenario, pairing, roster->actingRank, activeRank, position, roster->comments);
	else
		this->rosterFlightMgr.addByPairing(roster->idcrew, roster->rosterId, roster->idscenario, pairing, roster->actingRank, activeRank, position, "",roster->comments);

	//logCrewOnFlight("after addRoster", this->crewOnFlt, roster->pairing);
	return roster;
}


//add:增加Roster，从crew、pairing创建roster对象(sharedPtr)
//    返回新创建roster
SharedPtr<ROSTER> CrewDataContext::addRoster(ErrorContext * errCtx, SharedPtr<CREW> &crew, Pairing* pairing, string &rank, bool needRuleCheck, bool checkOverlap, int seqOrder) {  //给指定crew增加roster到rosterList, 返回新增的Roster

	int i = 0, j = 0, k = 0;
	char strBuf[100] = { 0 };
	char restStrBuf[100] = { 0 };
	char endBuf[100] = { 0 };
	SharedPtr<ROSTER> roster(new ROSTER());
	roster->idscenario    = this->scenarioId;
	roster->idcrew        = crew->idCrew;
	roster->needRuleCheck = needRuleCheck;  //needRuleCheck
	roster->rosterId      = tempIdGenerator--;
	roster->sourceType    = ROSTER_SOURCE_OR;
	roster->source        = "CR";
	roster->strUtc        = pairing->getStartTimeUtc();
	roster->restStrUtc    = pairing->getEndTimeUtc();
	roster->endUtc        = pairing->getEndTimeIncludingRestUtcSch();
	roster->duty          = pairing->getPrimeActivity();
	roster->actingRank    = rank;
	roster->isDelete      = "N";
	roster->pairing       = pairing;
	roster->pairId        = pairing->getDbId();
	roster->location      = pairing->getBase();
	roster->qualifier     = pairing->getQualifier(); //mantis#1272
	roster->label         = pairing->getLabel();
	roster->pairingStartDt = getStartTimeOfDay(pairing->getStartTime());


	roster->strLoc = pairing->getStartTime();
	roster->restStrLoc = pairing->getEndTime();
	roster->endLoc = pairing->getEndTimeIncludingRestLocSch();
    roster->actStrUtc = pairing->getStartTimeUtcAct();
    roster->actRestStrUtc = pairing->getEndTimeUtcAct();
    roster->actEndUtc = pairing->getEndTimeIncludingRestUtcAct();
    roster->actStrLoc = pairing->getStartTimeLocAct();
    roster->actRestStrLoc = pairing->getEndTimeLocAct();
    roster->actEndLoc = pairing->getEndTimeIncludingRestLocAct();
    if (roster->actStrUtc > 0)
        roster->strUtc = roster->actStrUtc;
    if (roster->actRestStrUtc > 0)
        roster->restStrUtc = roster->actRestStrUtc;
    if (roster->actEndUtc > 0)
        roster->endUtc = roster->actEndUtc;
    if (roster->actStrLoc > 0)
        roster->strLoc = roster->actStrLoc;
    if (roster->actRestStrLoc > 0)
        roster->restStrLoc = roster->actRestStrLoc;
    if (roster->actEndLoc > 0)
        roster->endLoc = roster->actEndLoc;
	//add seqOrder  ZZM 20190527
	roster->seqOrder = seqOrder;

	///TEST
	//{
		//if (roster->strLoc == 0 || roster->strLoc == -1) {
		//	cout << "DBG addRoster strLoc=" << roster->strLoc << " pairing=" << pairing->getDbId() << "\n";
		//}
		//if (roster->restStrLoc == 0 || roster->restStrLoc == -1) {
		//	cout << "DBG addRoster restStrLoc=" << roster->restStrLoc << " pairing=" << pairing->getDbId() << "\n";
		//}
		//if (roster->endLoc == 0 || roster->endLoc == -1) {
		//	cout << "DBG addRoster endLoc=" << roster->endLoc << " pairing=" << pairing->getDbId() << "\n";
		//}
	//}
	//
	return addRoster(errCtx, roster, checkOverlap);
	//return roster;
}
SharedPtr<ROSTER> CrewDataContext::addDXYRoster(ErrorContext * errCtx, SharedPtr<CREW> &crew, Pairing* pairing, string &rank, bool needRuleCheck, bool checkOverlap, int seqOrder)
{
	int i = 0, j = 0, k = 0;
	char strBuf[100] = { 0 };
	char restStrBuf[100] = { 0 };
	char endBuf[100] = { 0 };
	SharedPtr<ROSTER> roster(new ROSTER());
	roster->idscenario = this->scenarioId;
	roster->idcrew = crew->idCrew;
	roster->needRuleCheck = needRuleCheck;  //needRuleCheck
	roster->rosterId = tempIdGenerator--;
	roster->sourceType = ROSTER_SOURCE_OR;
	roster->source = "CR";
	roster->strUtc = pairing->getStartTimeUtc();
	roster->restStrUtc = pairing->getEndTimeUtc();
	roster->endUtc = pairing->getEndTimeUtc();
	roster->actStrUtc = roster->strUtc;
	roster->actRestStrUtc = roster->restStrUtc;
	roster->actEndUtc = roster->endUtc;
	roster->duty = "DXY";
	roster->actingRank = rank;
	roster->isDelete = "N";
	roster->pairing = pairing;
	roster->pairId = 0;
	roster->location = "PEK";

	roster->qualifier = "DXY"; //mantis#1272
	roster->label ="DXY";
	roster->pairingStartDt = getStartTimeOfDay(pairing->getStartTime());


	roster->strLoc = pairing->getStartTime();
	roster->restStrLoc = pairing->getEndTime();
	roster->endLoc = pairing->getEndTime();
	roster->actStrLoc = roster->strLoc;
	roster->actRestStrLoc = roster->restStrLoc;
	roster->actEndLoc = roster->endLoc;

	roster->seqOrder = seqOrder;
	return addRoster(errCtx, roster, checkOverlap);
	//return roster;
}
SharedPtr<ROSTER> CrewDataContext::delRoster(ErrorContext * errCtx, SharedPtr<CREW> &crew, int index) {
	int ret = 0;
	string dbg;
	SharedPtr<ROSTER> roster;
	vector<SharedPtr<ROSTER>>& rosterList = crew->rosterList;

	if (index == -1) {
		return NULL;
	}
	//DBG_HELP("delRoster");
	//stringstream ss;
	//if (crew->idCrew == "BRE16746") {
	//	ss << "delRoster(crew=" << crew->idCrew << ", crewRoster.size=" << rosterList.size() << ", delIndx=" << index << ")";
	//}
	//cout << ss.str() << endl;
	//DBG_HELP(ss.str());

	try {

		if (index >= (int)rosterList.size() || index < 0) {
			Logger::getRuleLogger()->error("delRoster on crew={} fail invalid parameter index={}", crew->idCrew, index);
			return nullptr;
		}

		//20181009 ain, mantis#4217, delRoster前重置 fdp
		if (mandayForRosterCalculator != NULL) {
			mandayForRosterCalculator->resetRoseter(index, crew); 
		}
		roster = rosterList[index];

		roster->indexInRosterListOfCrew = -1;

		//更新cof
		dbg = "removeCrewOnFlight";
		removeCrewOnFlight(roster, this->crewOnFlt);
		SharedPtr<CREW> crew = this->crewIdMap[roster->idcrew];
		ret = removeCrewOnPairing(roster->pairId, crew, this->crewOnPairing);
		dbg = "removeFromRosterList";

		
		//rosterFlight
		if (pairingIdMap.find(roster->pairId) != pairingIdMap.end()) {
			if(this->getApplicationType() == "OR" && (this->scenario.category == "RO" || this->scenario.category == "TO"))
				this->rosterFlightMgr.removeByPairingForRosterOptimizer(roster->idcrew, roster->pairing);
			else
				this->rosterFlightMgr.removeByPairing(roster->idcrew, roster->pairing);
		}
		//crew.rosterList
		rosterList.erase(rosterList.begin() + index);

		dbg = "mandayForRosterCalculator";
		//manday
		if (mandayForRosterCalculator != NULL) {
			mandayForRosterCalculator->reCalculateSingleRosterManday(crew, roster, false); //true for addRoster, false for delRoster
		}
		//从this.rosterList中移除roster
		this->rosterList.erase(std::remove_if(this->rosterList.begin(), this->rosterList.end(),
			[&roster](const auto& destRoster) {
				return roster->rosterId == destRoster->rosterId;
			}), this->rosterList.end());

		if (this->getApplicationType() == "OR" && (this->scenario.category == "RO" || this->scenario.category == "TO")) {
			delTrainingRosterTO(roster);
		}

		//recency
		dbg = "recency";
		recencyMgr.removeRecencyByRoster(roster->idcrew, roster->rosterId);

		//CrewKpiAdjust
		dbg = "CrewKpiAdjust";
		removeCrewKpiAdjustByRoster(crew, roster->rosterId, this->rosterFlightMgr);

		//刷新index
		dbg = "refreshRosterIndexOfCrew";
		refreshRosterIndexOfCrew(crew);

		//logCrewOnFlight("after delRoster", this->crewOnFlt, roster->pairing);
	}
	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("Exception: in delRoster(index), index={}, dbg={} ex:{}", index, dbg, ex.what());
	}
	catch (std::string& ex) {
		Logger::getRuleLogger()->error("Exception: in delRoster(index), index={}, dbg={} ex:{}", index, dbg, ex);
	}
	catch (...) {
		Logger::getRuleLogger()->error("Exception: delRoster(index), index={}, general exception.", index);
	}
	return roster;
}

//del:从指定crew移除roster从rosterList
//    返回移除的Roster
SharedPtr<ROSTER> CrewDataContext::delRoster(ErrorContext * errCtx, SharedPtr<ROSTER>& paramValue) {
	//DBG_HELP("delRoster");
	auto iter = crewIdMap.find(paramValue->idcrew);
	if (iter == crewIdMap.end() || iter->second == nullptr) {
		Logger::getRuleLogger()->error("ERROR: invalid data, delRoster fail, roster.crew={} not in scenario", paramValue->idcrew);
		return nullptr;
	}
	SharedPtr<CREW> crew = iter->second;
	int index = -1;
	//尝试在paramValue指定crew.rosterList中寻找
	//若未找到，尝试在全部crew中寻找
	for (std::size_t i = 0; i < crew->rosterList.size(); i++) {
		if (paramValue->rosterId == crew->rosterList[i]->rosterId) {
			index = (int)i;
			break;
		}
	}
	if (index == -1) {
		for (std::size_t n = 0; n < crewList.size(); n++) {
			crew = crewIdMap[crewList[n]->idCrew];
			for (std::size_t i = 0; i < crew->rosterList.size(); i++) {
				if (paramValue->rosterId == crew->rosterList[i]->rosterId) {
					index = (int)i;
					break;
				}
			}
		}
	}

	if (index == -1) {
		//20190222 ain, mantis#4989, delRoster目标不存在时返回不报错
		Logger::getRuleLogger()->error("ERROR: delRoster() fail, crew={} roster={} {} not exist", crew->idCrew, paramValue->rosterId, utcToUtcString(paramValue->strUtc));
		return NULL;
		//Logger::getRuleLogger()->error("delRoster fail");
	}
	return delRoster(errCtx, crew, index);
}

//del:从指定crew移除roster从rosterList
//    返回移除的Roster
SharedPtr<ROSTER> CrewDataContext::delRoster(ErrorContext * errCtx, SharedPtr<CREW> &crew, Pairing* pairing, string &rank) {
	//DBG_HELP("delRoster");

	int index = -1;
	for (std::size_t i = 0; i < crew->rosterList.size(); i++) {
		if (crew->rosterList[i]->pairId == pairing->getDbId()) {
			index = (int)i;
			break;
		}
	}
	
	if (index == -1) {
		//20190222 ain, mantis#4989, delRoster目标不存在时返回不报错
		Logger::getRuleLogger()->error("ERROR: delRoster() fail, crew={} {} not exist", crew->idCrew, utcToUtcString(pairing->getStartTimeLocAct()));
		return NULL;
	}
	return delRoster(errCtx, crew, index);
}

bool CrewDataContext::delPairing(ErrorContext * errCtx, long long pairingId) {
	bool success = false;
	//Pairing * p = NULL;
	for (std::size_t i = 0; i < this->pairingList.size(); i++) {
		Pairing* tmp = this->pairingList[i];
		if (tmp->getDbId() == pairingId) {
			//delete p;
			for (auto& crew : this->crewList) {
				for (auto& roster : crew->rosterList) {
					if (roster->pairing != nullptr && roster->pairing->getDbId() == pairingId) {
						//异常保护，pairing被删除前，未取消分配roster
						roster->pairing = nullptr;
						roster->pairId = 0;
						Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, roster have not been deleted, but pairing is deleted. crewId:{}. rosterId:{}, pairingId:{}", 
							crew->idCrew, roster->rosterId, pairingId);
					}
				}
			}

			removePairingLabelMapIndex(tmp, this->pairingLabelMap);
			deletePairingDutySeg(tmp);//20180423 ain, mantis#3189, delete pairing/duty/seg
			pairingList[i] = pairingList[pairingList.size() - 1];
			pairingList.pop_back();
			success = true;
			break;
		}
	}
	if (!success) {
		Logger::getRuleLogger()->error("pairing={} not found.", pairingId);
	}
	//20180815 ain, OP#1834, index
	//20180917 ain, mantis#4074, avoid call p->getDbId() after delete p
	if (pairingIdMap.find(pairingId) == pairingIdMap.end()) {
		Logger::getRuleLogger()->error("ERROR: invalid data, delPairing fail, pairing={} not found in pairingIdMap", pairingId);
		return success;
	}
	this->pairingIdMap.erase(pairingId);
	return success;
}


//参数 *pairing为外部维护指针，不能加入 dbData.pairingList，需要生成额外实例
bool CrewDataContext::addPairing(ErrorContext * errCtx, Pairing* pairing) {
	//check exists
	for (std::size_t i = 0; i < this->pairingList.size(); i++) {
		if (pairingList[i]->getDbId() == pairing->getDbId()) {
			Logger::getRuleLogger()->error("addPairing failed, pairingId={} already exist", pairing->getDbId());
			return false;
		}
	}

	//make copy
	Pairing * newInstance = new Pairing();
	newInstance->deepCopy(pairing);
	//20190611 ain, mantis#5896, addPairing后刷新 open-composition
	newInstance->resetOpenComposition();

	//insert
	this->pairingList.push_back(newInstance);

	//20180815 ain, OP#1834, index
	if (pairingIdMap.find(newInstance->getDbId()) != pairingIdMap.end()) {
		Logger::getRuleLogger()->error("ERROR: invalid data, addPairing fail, pairingId={} already exists", newInstance->getDbId());
		return false;
	}
	this->pairingIdMap[newInstance->getDbId()] = newInstance;
	makePairingLabelMapIndex(newInstance, this->pairingLabelMap);
	//更新this->flightIdToPairing索引
	//makeSegmentToPairingMap();
	return true;
}

//update: 更新对应roster数据
//        同时更新下属pairing级数据
void CrewDataContext::updateRoster(ErrorContext * errCtx, SharedPtr<ROSTER>& updateValue) {
	long long rosterId = updateValue->rosterId;

	//1. oldRoster存在，且crewId不同, 则DelRoster->AddRoster
	//2. oldRoster存在，且crewId相同, 则Update 字段数值
	//3. oldRoster不存在, 则addRoster
	SharedPtr<ROSTER> targetRoster = findRoster(updateValue->idcrew, rosterId);
	if (targetRoster) {
		SharedPtr<ROSTER> oldRosterCopy(new ROSTER);
		oldRosterCopy->copy(targetRoster.get());
		string newCrewId = updateValue->idcrew;
		string oldCrewId = targetRoster->idcrew;

		//20200515 ain, mantis#8393, updateRoster总删旧插新, 以适应地面任务编辑时间等功能
		if (oldCrewId != newCrewId) {
			Logger::getRuleLogger()->error("[ERROR] updateRoster rosterId={}, roster.idcrew {}->{}", targetRoster->idcrew, oldCrewId, newCrewId);
		}
		this->delRoster(errCtx, oldRosterCopy);
		targetRoster->copy(updateValue.get());
		this->addRoster(errCtx, targetRoster, false);

		//20190331 ain, mantis#5242, 修正splitPairing崩溃，roster.pairing_id变更后重新赋值 roster->pairing
		targetRoster->pairing = pairingIdMap.find(targetRoster->pairId) == pairingIdMap.end()
			? NULL : pairingIdMap[targetRoster->pairId];
	}
	else {
		//3
		this->addRoster(errCtx, updateValue, false);
	}
}


//update: 更新pairing数据
//因editor中未包含全部dbPairing字段，只更新editor涉及的部分字段
void CrewDataContext::updatePairing(ErrorContext * errCtx, Pairing* newPairing) {
	if (!newPairing || !errCtx) {
		Logger::getRuleLogger()->error("invalid parameter in updatePairing()");
		return;
	}

	//寻找目标
	Pairing * oldPairing = NULL;
	int index = -1;
	for (std::size_t i = 0; i < pairingList.size(); i++) {
		if (newPairing->getDbId() == pairingList[i]->getDbId()) {
			oldPairing = pairingList[i];
			index = (int)i;
			break;
		}
	}
	//20190511 ain, mantis#5546, 若pairing不存在, 则忽略 oldPairing, 不再抛出异常
	if (oldPairing == NULL) {
		Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, updatePairing pairing=({} {} {})  not exist", newPairing->getDbId(), utcToUtcDtString(newPairing->getStartTimeLocSch()), newPairing->getPrimeActivity());
	}

	//20190415 ain, 容忍异常数据: 相同ptn在同一crew身上出现多个rostesr, 避免crash
	//收集pairing关联的 crew (roster)
	map<string, SharedPtr<CREW>> pairingCrews;
	map<string, SharedPtr<ROSTER>> crewToRosters;
	vector<SharedPtr<ROSTER>> allRosters;
	for (auto& pair : this->crewIdMap) {
		auto& crew = pair.second;
		if (!crew)
			continue;
		for (auto& roster : crew->rosterList) {
			if (roster->pairId == newPairing->getDbId()) {
				pairingCrews[crew->idCrew] = crew;
				crewToRosters[crew->idCrew] = roster;
				allRosters.push_back(roster);

				if (mandayForRosterCalculator != NULL) {
					mandayForRosterCalculator->updatePairing(crew, roster, oldPairing);
				}
			}
		}
	}

	//针对 segment可能变化, 更新CrewOnFlt数据
	if (oldPairing) {
		resetCrewOnFltForPairingUpdate(oldPairing, newPairing, pairingCrews, crewToRosters, crewOnFlt);
	}
	//20191026 ain, mantis#6967, updatePairing 流程增加逻辑 add/del rosterFlight
	if (oldPairing) {
		for (auto& it : crewToRosters) {
			this->rosterFlightMgr.updateBypairing(it.first, it.second->actingRank, oldPairing, newPairing);
		}
	}

	//替换
	//因newPairing来自 ruleSrv json, json解析对象在ruleSrv请求结束后自动释放
	Pairing * newPairingCopy = new Pairing();
	newPairingCopy->deepCopy(newPairing);
	if (index >= 0)
		pairingList[index] = newPairingCopy;
	if (oldPairing) {
		//20190920 ain, delete 层级结构 Ptn/Duty/Seg/Node
		//delete oldPairing;
		removePairingLabelMapIndex(oldPairing, this->pairingLabelMap);
		deletePairingDutySeg(oldPairing);
		oldPairing = nullptr;
	}

	//20190517 ain, mantis#5635, pairing变化后按 seg重算 duty/pairing时间
	//20190611 yuankai.cai mantis#5926 pairing修改由RuleSrvHandler根据不同逻辑完成
	//newPairingCopy->resetPairingDutyTimes();

	//20181101 ain, mantis#4373, 更新 pairingIdMap
	this->pairingIdMap[newPairingCopy->getDbId()] = newPairingCopy;
	makePairingLabelMapIndex(newPairingCopy, this->pairingLabelMap);

	//更新roster->pairing
	//20180406 ain, updatePairing重算涉及roster
	for (auto& roster : allRosters) {
		//auto& roster = it.second;
		roster->pairing = newPairingCopy;
		roster->setStartTimeUtcSch(newPairingCopy->getStartTimeUtcSch());
		roster->setStartTimeLocSch(newPairingCopy->getStartTimeLocSch());
		roster->setEndTimeUtcSch(newPairingCopy->getEndTimeUtcSch());
		roster->setEndTimeLocSch(newPairingCopy->getEndTimeLocSch());

		roster->setStartTimeUtcAct(newPairingCopy->getStartTimeUtcAct());
		roster->setStartTimeLocAct(newPairingCopy->getStartTimeLocAct());
		roster->setEndTimeUtcAct(newPairingCopy->getEndTimeUtcAct());
		roster->setEndTimeLocAct(newPairingCopy->getEndTimeLocAct());

		if (mandayForRosterCalculator != NULL) {
			auto iterCrew = pairingCrews.find(roster->idcrew);
			if (iterCrew != pairingCrews.end()) {
				mandayForRosterCalculator->resetPairing(iterCrew->second, roster, newPairingCopy);
			}
		}
	}
	//20190607 ain, mantis#5896, updatePairing后刷新 newCopy.open/fill-comp
	//reset open-composition
	newPairingCopy->resetOpenComposition();
	long long pairingId = newPairingCopy->getDbId();
	if (crewOnPairing.find(pairingId) != crewOnPairing.end()) {
		for (auto& cop : crewOnPairing[pairingId]) {
			newPairingCopy->fillCompositionRank(cop->actingRank, 1);
		}
	}

	//manday
	//20180406 ain, updatePairing重算涉及roster manday
	if (mandayForRosterCalculator != NULL && this->applicationType == CREW_APP_TYPE_OR) {
		for (auto& it : pairingCrews) {
			auto& crew = it.second;
			auto& roster = crewToRosters[crew->idCrew];
			mandayForRosterCalculator->reCalculateSingleRosterManday(crew, roster, true); //true for addRoster, false for delRoster
		}
	}
	errCtx->errorCode = 0;
}

void CrewDataContext::updateFlight(ErrorContext * errCtx, Segment* flt, const unordered_multimap<long long, Segment*>& flightIdToPairingSegment) {
	if (!flt || !errCtx) {
		Logger::getRuleLogger()->error("invalid parameter in updateFlight()");
		return;
	}

	//SharedPtr<Segment> target;
	//for (auto& tmp : flightList) {
	//	if (tmp->getDBId() == flt->getDBId()) {
	//		target = tmp;
	//		break;
	//	}
	//}
	//if (!target) {
	//	return;
	//}

	auto iterFlt = this->flightIdMap.find(flt->getDBId());
	if (iterFlt == this->flightIdMap.end()) {
		Logger::getRuleLogger()->error("[updateFlight] flight ({} {} {} {}) do not exists.", flt->getDBId(), flt->getAirline(), flt->getFlightNumber(), flt->getDate());
		return;
	}
	auto& target = iterFlt->second;

	//刷新 flt
	target->copyFltValue(flt);

	//刷新 pairing/seg
	auto posPairSeg = flightIdToPairingSegment.equal_range(target->getDBId());
	while (posPairSeg.first != posPairSeg.second)
	{
		auto& s = posPairSeg.first->second;
		s->copyFltValue(target.get());
		++posPairSeg.first;
	}

	//for (auto& p : pairingList) {
	//	for (std::size_t i = 0; i < p->getNumDuties(); i++) {
	//		Duty* d = p->getDuty(i);
	//		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
	//			Segment* s = d->getSegment(j);
	//			if (s->getDBId() == target->getDBId()) {
	//				s->copyFltValue(target.get());
	//			}
	//		}
	//	}
	//}
}
//
//根据idcrew、strUtc查找ROSTER
//未找到则返回null
SharedPtr<ROSTER> CrewDataContext::findRoster(const long long rosterId) const {
	if (rosterId == 0)
		return NULL;
	SharedPtr<ROSTER> roster(NULL);
	for (std::size_t j = 0; j < crewList.size(); j++) {
		SharedPtr<CREW> crew = crewList[j];
		for (std::size_t i = 0; i < crew->rosterList.size(); i++) {
			if (crew->rosterList[i]->rosterId == rosterId) {
				roster = crew->rosterList[i];
				break;
			}
		}
		if (roster.get() != NULL) {
			break;
		}
	}
	if (roster.get() == NULL) {
		//stringstream ss;
		//ss << "roster=" << rosterId << " not found";
		//Logger::getRuleLogger()->error(ss.str());
		//20191126 ain, mantis#7159, findRoster未找到不再异常，而是返回null
		Logger::getRuleLogger()->warn("WARN: findRoster, roster={} not found", rosterId);
		return NULL;
	}
	return roster;
}

std::shared_ptr<ROSTER> CrewDataContext::findRoster(const string& crewId, const long long rosterId) const {
	if (rosterId == 0)
		return NULL;
	SharedPtr<ROSTER> roster(NULL);
	auto iterCrew = crewIdMap.find(crewId);
	if (iterCrew == crewIdMap.end()) {
		return findRoster(rosterId);
	}
	const SharedPtr<CREW>& crew = iterCrew->second;
	for (std::size_t i = 0; i < crew->rosterList.size(); i++) {
		if (crew->rosterList[i]->rosterId == rosterId) {
			roster = crew->rosterList[i];
			break;
		}
	}
	if (roster == nullptr) {
		Logger::getRuleLogger()->warn("WARN: findRoster, crew={} roster={} not found", crewId, rosterId);
		return nullptr;
	}
	return roster;
}

std::shared_ptr<ROSTER> CrewDataContext::findRosterByPairing(const string& crewId, const long long pairingId) const {
	if (pairingId == 0)
		return nullptr;
	SharedPtr<ROSTER> roster = nullptr;
	auto iterCrew = crewIdMap.find(crewId);
	if (iterCrew == crewIdMap.end()) {
		return nullptr;
	}
	const SharedPtr<CREW>& crew = iterCrew->second;
	for (std::size_t i = 0; i < crew->rosterList.size(); i++) {
		if (crew->rosterList[i]->pairId == pairingId) {
			roster = crew->rosterList[i];
			break;
		}
	}
	if (roster == nullptr) {
		Logger::getRuleLogger()->warn("WARN: findRosterByPairing, crew={} pairingId={} not found", crewId, pairingId);
		return nullptr;
	}
	return roster;
}

//clean: rollback, 将rosterList回复为pre-assign结果
//前次or计算结果也会被丢弃
void CrewDataContext::cleanRoster(){                                                                                      
	this->rosterList.clear();
	this->rosterList.insert(rosterList.end(), preAssignRosterList.begin(), preAssignRosterList.end());
}

//刷新指定crew下属rosterList中各项的索引indexInRosterListOfCrew
void CrewDataContext::refreshRosterIndexOfCrew(SharedPtr<CREW> &crew) {
	for (int i = 0; i < (int)crew->rosterList.size(); i++) {
		crew->rosterList[i]->indexInRosterListOfCrew = i;
	}
}

//获取指定机场时区，按小时计算PEK -> 8
//待废弃的函数，不支持夏令时。请改用DutyUtils::GetTimeZoneOffset, TimezoneUtils::GetTimezoneOffset
int CrewDataContext::getAirportOffsetMinutes(string airport){
	try {

		auto iter = this->airportUtcOffsetMap.find(airport);
		if (iter != this->airportUtcOffsetMap.end()) {
			return iter->second;
		}
		else {
			//20190528 ain, mantis#5745, 增加 default airport offset机制, 尽可能减少crash
			if (AirportDefault::instance().isDefaultExist(airport)) {
				auto minutes = AirportDefault::instance().getOffsetMinutes(airport);
				return minutes;
			}
			else {
				Logger::getRuleLogger()->error("'{}' is not valid airport", airport);
			}
		}
	}
	catch (...) {
		Logger::getRuleLogger()->error("EXCEPTION: getAirportOffset({}) fail", airport);
	}
	
	return 0;
}


//获取指定机场时区ZoneId
string CrewDataContext::getAirportZoneId(const string& airport) const {
	try {

		auto iter = this->airportZoneIdMap.find(airport);
		if (iter != this->airportZoneIdMap.end()) {
			return iter->second;
		}
		else {
			//未配置，则使用UTC时区
			return "Etc/UTC";
		}
	}
	catch (...) {
		Logger::getRuleLogger()->error("EXCEPTION: getAirportZoneId({}) fail", airport);
	}

	return "Etc/UTC";
}

static map<string, bool> warningGetCrewBaseOffset;

//获取指定crew在指定时间对应所在属地（crew_base）的时区
int CrewDataContext::getCrewBaseOffsetMinutes(string idcrew, time_t timeUtc) {
	if (this->crewIdMap.find(idcrew) == this->crewIdMap.end()) {
		Logger::getRuleLogger()->error("ERROR: getCrewBaseOffset fail, idcrew={} not in scenario, possible reason: rank/base/fleet not match, default crew base offset=0", idcrew.c_str());
		return 0;
	}

	bool foundMatch = false;
	SharedPtr<CREW>& crew = this->crewIdMap[idcrew];
	long crewBaseTimezoneOffset = 0;
	for (std::size_t i = 0; i < crew->baseList.size(); i++) {
		SharedPtr<CREW_BASE>& cb = crew->baseList[i];
		if (cb->effUtc <= timeUtc && (cb->expUtc == -1 || cb->expUtc > timeUtc)) {
			crewBaseTimezoneOffset = this->getAirportOffsetMinutes(cb->base);
			foundMatch = false;
			break;
		}
	}
	if (!foundMatch) {
		if (warningGetCrewBaseOffset.find(idcrew) == warningGetCrewBaseOffset.end()) {
			//cout << "ERROR: invalid data, no base match crew=" << idcrew << " at " << utcToUtcString(timeUtc) << ", possble reason: time of crew_base/rank/fleet/qual are inconsistent" << endl;
			warningGetCrewBaseOffset[idcrew] = true;
		}
	}
	return crewBaseTimezoneOffset;
}

//检查指定assignment是否在指定group中存在
//因assignment group为 多对多 关系，使用multimap维护
bool CrewDataContext::isAssignmentInGroup(const string &assignment, const string &group) {
	//multimap<string, string>::iterator itKey;
	//multimap<string, string>::iterator itVal;

	////check for map KEY
	//itKey = this->assignmentNameGroupMap.find(assignment);
	//if (itKey == this->assignmentNameGroupMap.end()) {
	//	return false;
	//}
	////check for map Value of KEY
	//pair<multimap<string, string>::iterator, multimap<string, string>::iterator> ret = assignmentNameGroupMap.equal_range(assignment);
	//for (itVal = ret.first; itVal != ret.second; itVal++) {
	//	if (itVal->second == group)
	//		return true;
	//}
//	const string group_const = group;
	// auto& itKey = this->assignmentNameGroupMap.find(group_const);
	auto itKey = this->assignmentNameGroupMap.find(group);

	if (itKey == this->assignmentNameGroupMap.end())
		return false;

	// auto& itVal = itKey->second.find(assignment);
	auto itVal = itKey->second.find(assignment);

	if (itVal == itKey->second.end()) {
		return false;
	}
	return true;
}

bool CrewDataContext::isAssignmentInGroup(const string& assignment, const std::vector<string>& groups) {
	for (auto& group : groups) {
		if (this->isAssignmentInGroup(assignment, group)) {
			return true;
		}
	}
	return false;
}

unordered_set<string>& CrewDataContext::getAssignmentsInGroup(const string& group) {
	return this->assignmentNameGroupMap[group];
}

bool CrewDataContext::isAssignmentIncludeOrInGroup(string assignment, SharedPtr<RankCombinationCriteria> rankComb) {
	bool match = false;
	if (rankComb->assignmentVec.end() != std::find(rankComb->assignmentVec.begin(), rankComb->assignmentVec.end(), assignment)) {
		match = true;
	}
	if (!match) {
		for (auto& group : rankComb->assignmentVec) {
			if (this->isAssignmentInGroup(assignment, group)) {
				match = true;
				break;
			}
		}
	}
	return match;
}

//
vector<string>& CrewDataContext::getRule8014AssignmentsByGrps(string dutyGrps) {
	if (indexRule8014DutyGrp.find(dutyGrps) != indexRule8014DutyGrp.end()) {
		return indexRule8014DutyGrp[dutyGrps];
	}
	else {
		vector<string> assignmentGroups;
		vector<string> vDutyGroup;
		split(dutyGrps.c_str(), '|', assignmentGroups);

		if (dutyGrps == "*") {
			for (vector<SharedPtr<DBRule_8014>>::iterator assignment = this->rule_8014.begin(); assignment != this->rule_8014.end(); assignment++) {
				if (std::find(assignmentGroups.begin(), assignmentGroups.end(), (*assignment)->assignmentGroup) != assignmentGroups.end()) {
					vDutyGroup.push_back((*assignment)->assignemnt);
				}
			}
			this->indexRule8014DutyGrp[dutyGrps] = vDutyGroup;
		}
		else {
			for (vector<SharedPtr<DBRule_8014>>::iterator assignment = this->rule_8014.begin(); assignment != this->rule_8014.end(); assignment++) {
				if (std::find(assignmentGroups.begin(), assignmentGroups.end(), (*assignment)->assignmentGroup) != assignmentGroups.end()) {
					vDutyGroup.push_back((*assignment)->assignemnt);
				}
			}
			this->indexRule8014DutyGrp[dutyGrps] = vDutyGroup;
		}
		return this->indexRule8014DutyGrp[dutyGrps];
	}
}

void CrewDataContext::clearRuleList() {
	_ruleFuncList.clear();
	_ruleFuncMap.clear();
}

set<int>& CrewDataContext::getRuleFuncList() {
	return _ruleFuncList;
}

inline static void updateMergeDpRosterId(std::shared_ptr<CREW>& crew, const long long oldId, const long long newId) {
	if (crew == nullptr) return;

	for (auto& roster : crew->rosterList) {
		if (roster == nullptr) continue;

		if (roster->mergeDpNextRosterId == oldId) {
			roster->mergeDpNextRosterId = newId;
		}

		if (roster->mergeDpBeforeRosterId == oldId) {
			roster->mergeDpBeforeRosterId = newId;
		}
	}
}

//更新pairing/roster对象id
//用于editor save操作时临时 id变为数据库 sequence值
//20190531 ain, mantis#5187, pairing_id变更同时刷新 roster.pairing_id
void CrewDataContext::updateActivityId(bool& isReindexAfterUpdateRosterId, const SharedPtr<UpdateActivityIdItem>& updateActivityIdItem, const vector<SharedPtr<UpdateActivityIdItem>>& updateDutyIdList) {
	const string& type = updateActivityIdItem->type;
	const string& crewId = updateActivityIdItem->crewId;
	const long long oldId = updateActivityIdItem->oldId;
	const long long newId = updateActivityIdItem->newId;
	if (type == "ROSTER") {
		isReindexAfterUpdateRosterId = true;
		bool found = false;
		if (!crewId.empty()) {
			auto iterCrew = this->crewIdMap.find(crewId);
			if (iterCrew != this->crewIdMap.end()) {
				auto& crew = iterCrew->second;
				for (auto& roster : crew->rosterList) {
					if (roster->rosterId == oldId) {
						roster->rosterId = newId;
						vector<SharedPtr<RosterFlight>> rfs = rosterFlightMgr.get(crew->idCrew);
						for (auto& rf : rfs) {
							if (rf->rosterId == oldId) {
								rf->rosterId = newId;
							}
						}
						this->recencyMgr.updateRosterId(crew->idCrew, oldId, newId);
						found = true;
						break;
					}
				}
				updateMergeDpRosterId(crew, oldId, newId);
			}
		}
		else {
			for (auto& crew : crewList) {
				for (auto& roster : crew->rosterList) {
					if (roster->rosterId == oldId) {
						roster->rosterId = newId;
						vector<SharedPtr<RosterFlight>> rfs = rosterFlightMgr.get(crew->idCrew);
						for (auto& rf : rfs) {
							if (rf->rosterId == oldId) {
								rf->rosterId = newId;
							}
						}
						this->recencyMgr.updateRosterId(crew->idCrew, oldId, newId);
						found = true;
						break;
					}
				}
				updateMergeDpRosterId(crew, oldId, newId);
				if (found)
					break;
			}
		}
		updateRosterId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: roster {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->info("[UPDATE_ID] fail:    roster {} not found", oldId);
		}
	}
	else if (type == "PAIRING") {
		bool found = false;
		for (Pairing* p : pairingList) {
			if (p->getDbId() == oldId) {
				p->setDbId(newId);
				updateDutyActivityId(p, updateDutyIdList);
				//20180919 ain, mantis#4093, save pairing时更新 pairingIdMap中id
				if (pairingIdMap.find(oldId) != pairingIdMap.end()) {
					p->setOpenComposition(pairingIdMap[oldId]->getOpenComposition());
					pairingIdMap.erase(oldId);
					pairingIdMap[newId] = p;
				}
				//20190531 ain, roster.pairing_id / cop.pairing_id
				if (this->crewOnPairing.find(oldId) != this->crewOnPairing.end()) {
					auto& cops = crewOnPairing[oldId];
					for (auto& cop : cops) {
						cop->pairingId = newId;
						updateDutyActivityId(cop, updateDutyIdList);
						auto& crew = crewIdMap[cop->crewId];
						if (crew) {	
							vector<SharedPtr<RosterFlight>> rfs = rosterFlightMgr.get(crew->idCrew);
							for (auto& rf : rfs){
								if (rf->pairingId == oldId){
									rf->pairingId = newId;
									updateDutyActivityId(rf, updateDutyIdList);
								}
							}
							for (auto& r : crew->rosterList) {
								if (r->pairId == oldId) {
									r->pairId = newId;
									Logger::getRuleLogger()->info("[UPDATE_ID] roster crew={} pairing_id {} -> {} ", r->idcrew.c_str(), oldId, newId);
								}
							}
						}
					}
				
					crewOnPairing[newId] = cops;
					crewOnPairing.erase(oldId);	
				}
				found = true;
				break;
			}
		}
		if (found) {
			makeSegmentToPairingMap();
			Logger::getRuleLogger()->info("[UPDATE_ID] success: pairing {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->info("[UPDATE_ID] fail:    pairing {} not found", oldId);
		}
	}
	else if (type == "FLIGHT") {
		bool found = false;
		//更新Flight对象中Id
		{
			auto iter = this->flightIdMap.find(oldId);
			if (iter != this->flightIdMap.end()) {
				auto& flight = iter->second;
				flight->setDBId(newId);

				this->flightIdMap[newId] = flight;
				this->flightIdMap.erase(oldId);
				found = true;
			}
		}

		//更新Pairing中Segment的FlightId
		{
			for (auto& pairing : this->pairingList) {
				for (auto& segment : pairing->getSegments()) {
					if (segment->getDBId() == oldId) {
						segment->setDBId(newId);
					}
				}
			}
		}

		//更新RosterFlight
		{
			this->rosterFlightMgr.updateFlightId(oldId, newId);
		}
		

		//更新tmProgramCourseList
		{
			auto tmpProgramCourseList = this->tmProgramCourseIndex->getByFlightId(oldId);
			for (auto& tmProgramCourse : tmpProgramCourseList) {
				tmProgramCourse->fltId = newId;
			}
			if (!tmpProgramCourseList.empty())
				this->tmProgramCourseIndex = std::make_shared<TmProgramCourseIndex>(this->tmProgramCourseMap);
		}

		//更新tmProgramCourseInstructorList
		{
			auto tmpProgramCourseInstructorList = this->tmProgramCourseInstructorIndex->getByFlightId(oldId);
			for (auto& tmpProgramCourseInstructor : tmpProgramCourseInstructorList) {
				tmpProgramCourseInstructor->fltId = newId;
			}
			if (!tmpProgramCourseInstructorList.empty())
				this->tmProgramCourseInstructorIndex = std::make_shared<TmProgramCourseInstructorIndex>(this->tmProgramCourseInstructorMap);
		}

		//更新crewOnFlt
		{
			auto iter = this->crewOnFlt.find(oldId);
			if (iter != this->crewOnFlt.end()) {
				auto& cofs = iter->second;
				for (auto& cof : cofs) {
					cof->fltId = newId;
				}

				this->crewOnFlt[newId] = cofs;
				this->crewOnFlt.erase(oldId);
			}
		}

		if (found) {
			//makeSegmentToPairingMap();
			Logger::getRuleLogger()->info("[UPDATE_ID] success: update {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->info("[UPDATE_ID] fail: update {} not found", oldId);
		}
	}
	else if (type == "ROSTERFLIGHTKPI") {
		bool found = false;
		for (auto& crew : crewList) {
			for (auto& crewKpiAdjust : crew->crewKpiAdjustList) {
				if (crewKpiAdjust->id == oldId) {
					crewKpiAdjust->id = newId;
					found = true;
					break;
				}
			}
			if (found)
				break;
		}
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: RosterFlightKpi {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: RosterFlightKpi {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMCOURSE") {
		bool found = false;

		auto tmProgramCourse = this->tmProgramCourseIndex->getById(oldId);
		if (tmProgramCourse != nullptr) {
			found = true;
			tmProgramCourse->id = newId;
			auto mapIter = this->tmProgramCourseMap.find(oldId);
			if (mapIter != this->tmProgramCourseMap.end()) {
				this->tmProgramCourseMap.erase(mapIter);
			}
			this->tmProgramCourseMap[newId] = tmProgramCourse;
			this->tmProgramCourseIndex = std::make_shared<TmProgramCourseIndex>(this->tmProgramCourseMap);
		}
		updateTmProgramCourseId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramCourse {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramCourse {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMCOURSEINSTRUCTOR") {
		bool found = false;

		auto tmProgramCourseInstructor = this->tmProgramCourseInstructorIndex->getById(oldId);
		if (tmProgramCourseInstructor != nullptr) {
			found = true;
			tmProgramCourseInstructor->id = newId;
			auto mapIter = this->tmProgramCourseInstructorMap.find(oldId);
			if (mapIter != this->tmProgramCourseInstructorMap.end()) {
				this->tmProgramCourseInstructorMap.erase(mapIter);
			}
			this->tmProgramCourseInstructorMap[newId] = tmProgramCourseInstructor;
			this->tmProgramCourseInstructorIndex = std::make_shared<TmProgramCourseInstructorIndex>(this->tmProgramCourseInstructorMap);
		}
		updateTmProgramCourseInstructorId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramCourseInstructor {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramCourseInstructor {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMCOURSEPNR") {
		bool found = false;

		auto tmProgramCoursePnr = this->tmProgramCoursePnrIndex->getById(oldId);
		if (tmProgramCoursePnr != nullptr) {
			found = true;
			tmProgramCoursePnr->id = newId;
			this->tmProgramCoursePnrIndex = std::make_shared<TmProgramCoursePnrIndex>(this->tmProgramCoursePnrList);
		}
		updateTmProgramCoursePnrId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramCoursePnr {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramCoursePnr {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAM") {
		bool found = false;

		auto tmProgram = this->tmProgramIndex->getById(oldId);
		if (tmProgram != nullptr) {
			found = true;
			tmProgram->id = newId;
			this->tmProgramIndex = std::make_shared<TmProgramIndex>(this->tmProgramList);
		}
		updateTmProgramId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgram {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgram {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMBUDDY") {
		bool found = false;

		auto tmProgramBuddy = this->tmProgramBuddyIndex->getById(oldId);
		if (tmProgramBuddy != nullptr) {
			found = true;
			tmProgramBuddy->id = newId;
			this->tmProgramBuddyIndex = std::make_shared<TmProgramBuddyIndex>(this->tmProgramBuddyList);
		}
		updateTmProgramBuddyId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramBuddy {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramBuddy {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMBUDDYTIME") {
		bool found = false;

		auto tmProgramBuddyTime = this->tmProgramBuddyTimeIndex->getById(oldId);
		if (tmProgramBuddyTime != nullptr) {
			found = true;
			tmProgramBuddyTime->id = newId;
			this->tmProgramBuddyTimeIndex = std::make_shared<TmProgramBuddyTimeIndex>(this->tmProgramBuddyTimeList);
		}
		updateTmProgramBuddyTimeId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramBuddyTime {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramBuddyTime {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMBUDDYCOURSE") {
		bool found = false;

		auto tmProgramBuddyCourse = this->tmProgramBuddyCourseIndex->getById(oldId);
		if (tmProgramBuddyCourse != nullptr) {
			found = true;
			tmProgramBuddyCourse->id = newId;
			this->tmProgramBuddyCourseIndex = std::make_shared<TmProgramBuddyCourseIndex>(this->tmProgramBuddyCourseList);
		}
		updateTmProgramBuddyCourseId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramBuddyCourse {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramBuddyCourse {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMPIP") {
		bool found = false;

		auto tmProgramPip = this->tmProgramPipIndex->getById(oldId);
		if (tmProgramPip != nullptr) {
			found = true;
			tmProgramPip->id = newId;
			this->tmProgramPipIndex = std::make_shared<TmProgramPipIndex>(this->tmProgramPipList);
		}
		updateTmProgramPipId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramPip {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramPip {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMCOURSELIMITATION") {
		bool found = false;

		auto tmProgramCourseLimitation = this->tmProgramCourseLimitationIndex->getById(oldId);
		if (tmProgramCourseLimitation != nullptr) {
			found = true;
			tmProgramCourseLimitation->id = newId;
			this->tmProgramCourseLimitationIndex = std::make_shared<TmProgramCourseLimitationIndex>(this->tmProgramCourseLimitationList);
		}
		updateTmProgramCourseLimitationId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramCourseLimitation {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramCourseLimitation {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMCOURSEROLE") {
		bool found = false;

		auto tmProgramCourseRole = this->tmProgramCourseRoleIndex->getById(oldId);
		if (tmProgramCourseRole != nullptr) {
			found = true;
			tmProgramCourseRole->id = newId;
			this->tmProgramCourseRoleIndex = std::make_shared<TmProgramCourseRoleIndex>(this->tmProgramCourseRoleList);
		}
		updateTmProgramCourseRoleId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramCourseRole {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramCourseRole {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMCOURSEROLEQUAL") {
		bool found = false;

		auto tmProgramCourseRoleQual = this->tmProgramCourseRoleQualIndex->getById(oldId);
		if (tmProgramCourseRoleQual != nullptr) {
			found = true;
			tmProgramCourseRoleQual->id = newId;
			this->tmProgramCourseRoleQualIndex = std::make_shared<TmProgramCourseRoleQualIndex>(this->tmProgramCourseRoleQualList);
		}
		updateTmProgramCourseRoleQualId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramCourseRoleQual {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramCourseRoleQual {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMCOURSEROLELIMITATION") {
		bool found = false;

		auto tmProgramCourseRoleLimitation = this->tmProgramCourseRoleLimitationIndex->getById(oldId);
		if (tmProgramCourseRoleLimitation != nullptr) {
			found = true;
			tmProgramCourseRoleLimitation->id = newId;
			this->tmProgramCourseRoleLimitationIndex = std::make_shared<TmProgramCourseRoleLimitationIndex>(this->tmProgramCourseRoleLimitationList);
		}
		updateTmProgramCourseRoleLimitationId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramCourseRoleLimitation {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramCourseRoleLimitation {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMCOURSEIPROLE") {
		bool found = false;

		auto tmProgramCourseIpRole = this->tmProgramCourseIpRoleIndex->getById(oldId);
		if (tmProgramCourseIpRole != nullptr) {
			found = true;
			tmProgramCourseIpRole->id = newId;
			this->tmProgramCourseIpRoleIndex = std::make_shared<TmProgramCourseIpRoleIndex>(this->tmProgramCourseIpRoleList);
		}
		updateTmProgramCourseIpRoleId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramCourseIpRole {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramCourseIpRole {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMCOURSEIPROLEBASE") {
		bool found = false;

		auto tmProgramCourseIpRoleBase = this->tmProgramCourseIpRoleBaseIndex->getById(oldId);
		if (tmProgramCourseIpRoleBase != nullptr) {
			found = true;
			tmProgramCourseIpRoleBase->id = newId;
			this->tmProgramCourseIpRoleBaseIndex = std::make_shared<TmProgramCourseIpRoleBaseIndex>(this->tmProgramCourseIpRoleBaseList);
		}
		updateTmProgramCourseIpRoleBaseId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramCourseIpRoleBase {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramCourseIpRoleBase {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMCOURSEIPROLEQUAL") {
		bool found = false;

		auto tmProgramCourseIpRoleQual = this->tmProgramCourseIpRoleQualIndex->getById(oldId);
		if (tmProgramCourseIpRoleQual != nullptr) {
			found = true;
			tmProgramCourseIpRoleQual->id = newId;
			this->tmProgramCourseIpRoleQualIndex = std::make_shared<TmProgramCourseIpRoleQualIndex>(this->tmProgramCourseIpRoleQualList);
		}
		updateTmProgramCourseIpRoleQualId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramCourseIpRoleQual {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramCourseIpRoleQual {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMCOURSEIPCK") {
		bool found = false;

		auto tmProgramCourseIpck = this->tmProgramCourseIpckIndex->getById(oldId);
		if (tmProgramCourseIpck != nullptr) {
			found = true;
			tmProgramCourseIpck->id = newId;
			this->tmProgramCourseIpckIndex = std::make_shared<TmProgramCourseIpckIndex>(this->tmProgramCourseIpckList);
		}
		updateTmProgramCourseIpckId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramCourseIpck {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramCourseIpck {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMCOURSEMORE") {
		bool found = false;

		auto tmProgramCourseMore = this->tmProgramCourseMoreIndex->getById(oldId);
		if (tmProgramCourseMore != nullptr) {
			found = true;
			tmProgramCourseMore->id = newId;
			this->tmProgramCourseMoreIndex = std::make_shared<TmProgramCourseMoreIndex>(this->tmProgramCourseMoreList);
		}
		updateTmProgramCourseMoreId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramCourseMore {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramCourseMore {} not found", oldId);
		}
	}
	else if (type == "TMPROGRAMCOURSEMORELEG") {
		bool found = false;

		auto tmProgramCourseMoreLeg = this->tmProgramCourseMoreLegIndex->getById(oldId);
		if (tmProgramCourseMoreLeg != nullptr) {
			found = true;
			tmProgramCourseMoreLeg->id = newId;
			this->tmProgramCourseMoreLegIndex = std::make_shared<TmProgramCourseMoreLegIndex>(this->tmProgramCourseMoreLegList);
		}
		updateTmProgramCourseMoreLegId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmProgramCourseMoreLeg {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmProgramCourseMoreLeg {} not found", oldId);
		}
	}
	else if (type == "TMDEVICETIME") {
		bool found = false;

		auto tmDeviceTime = this->tmDeviceTimeIndex->getById(oldId);
		if (tmDeviceTime != nullptr) {
			found = true;
			tmDeviceTime->id = newId;
			this->tmDeviceTimeIndex = std::make_shared<TmDeviceTimeIndex>(this->tmDeviceTimeList, this);
		}
		updateTmDeviceTimeId(oldId, newId);
		if (found) {
			Logger::getRuleLogger()->info("[UPDATE_ID] success: TmDeviceTime {} -> {} ", oldId, newId);
		}
		else {
			Logger::getRuleLogger()->warn("[UPDATE_ID] fail: TmDeviceTime {} not found", oldId);
		}
	}
}

void CrewDataContext::updateRosterId(const long long oldId, const long long newId) {
	//TmProgramCourse
	auto tmpProgramCourseList = this->tmProgramCourseIndex->getByRosterId(oldId);
	for (auto& tmProgramCourse : tmpProgramCourseList) {
		if (tmProgramCourse->rosterId == oldId) {
			tmProgramCourse->rosterId = newId;
		}
		else if (tmProgramCourse->rosterGroundId == oldId) {
			tmProgramCourse->rosterGroundId = newId;
		}
	}
	
	//TmProgramCourseInstructor
	auto tmpProgramCourseInstructorList = this->tmProgramCourseInstructorIndex->getByRosterId(oldId);
	for (auto& tmProgramCourseInstructor : tmpProgramCourseInstructorList) {
		if (tmProgramCourseInstructor->rosterId == oldId) {
			tmProgramCourseInstructor->rosterId = newId;
		}
		else if (tmProgramCourseInstructor->rosterGroundId == oldId) {
			tmProgramCourseInstructor->rosterGroundId = newId;
		}
	}
}

void CrewDataContext::reindexAfterUpdateRosterId() {
	this->tmProgramCourseIndex = std::make_shared<TmProgramCourseIndex>(this->tmProgramCourseMap);
	this->tmProgramCourseInstructorIndex = std::make_shared<TmProgramCourseInstructorIndex>(this->tmProgramCourseInstructorMap);
}

void CrewDataContext::updateTmProgramCourseId(const long long oldId, const long long newId) {
	//ROSTER
	for (auto& roster : this->rosterList) {
		if (roster->tmProgramCourseId == oldId) {
			roster->tmProgramCourseId = newId;
		}
	}

	//TmProgramCourseInstructor programCourseId  废弃不在使用
	//for (auto& tmProgramCourseInstructor : this->tmProgramCourseInstructorMap) {
	//	if (tmProgramCourseInstructor->programCourseId == oldId) {
	//		tmProgramCourseInstructor->programCourseId = newId;
	//	}
	//}
	//this->tmProgramCourseInstructorIndex = std::make_shared<TmProgramCourseInstructorIndex>(this->tmProgramCourseInstructorMap);

	//TmProgramCoursePnr
	for (auto& tmProgramCoursePnr : this->tmProgramCoursePnrList) {
		if (tmProgramCoursePnr->tmProgramCourseId == oldId) {
			tmProgramCoursePnr->tmProgramCourseId = newId;
		}
	}
	this->tmProgramCoursePnrIndex = std::make_shared<TmProgramCoursePnrIndex>(this->tmProgramCoursePnrList);

	//rosterFlight
	this->rosterFlightMgr.updateProgramCourseId(oldId, newId);

	//TmProgramCourseLimitation
	for (auto& tmProgramCourseLimitation : this->tmProgramCourseLimitationList) {
		if (tmProgramCourseLimitation->programCourseId == oldId) {
			tmProgramCourseLimitation->programCourseId = newId;
		}
	}
	this->tmProgramCourseLimitationIndex = std::make_shared<TmProgramCourseLimitationIndex>(this->tmProgramCourseLimitationList);

	//TmProgramCourseRole
	for (auto& tmProgramCourseRole : this->tmProgramCourseRoleList) {
		if (tmProgramCourseRole->programCourseId == oldId) {
			tmProgramCourseRole->programCourseId = newId;
		}
	}
	this->tmProgramCourseRoleIndex = std::make_shared<TmProgramCourseRoleIndex>(this->tmProgramCourseRoleList);

	//TmProgramCourseRoleQual
	for (auto& tmProgramCourseRoleQual : this->tmProgramCourseRoleQualList) {
		if (tmProgramCourseRoleQual->programCourseId == oldId) {
			tmProgramCourseRoleQual->programCourseId = newId;
		}
	}
	this->tmProgramCourseRoleQualIndex = std::make_shared<TmProgramCourseRoleQualIndex>(this->tmProgramCourseRoleQualList);

	//TmProgramCourseRoleLimitation
	for (auto& tmProgramCourseRoleLimitation : this->tmProgramCourseRoleLimitationList) {
		if (tmProgramCourseRoleLimitation->programCourseId == oldId) {
			tmProgramCourseRoleLimitation->programCourseId = newId;
		}
	}
	this->tmProgramCourseRoleLimitationIndex = std::make_shared<TmProgramCourseRoleLimitationIndex>(this->tmProgramCourseRoleLimitationList);

	//TmProgramCourseIpRole
	for (auto& tmProgramCourseIpRole : this->tmProgramCourseIpRoleList) {
		if (tmProgramCourseIpRole->programCourseId == oldId) {
			tmProgramCourseIpRole->programCourseId = newId;
		}
	}
	this->tmProgramCourseIpRoleIndex = std::make_shared<TmProgramCourseIpRoleIndex>(this->tmProgramCourseIpRoleList);

	//TmProgramCourseIpRoleBase
	for (auto& tmProgramCourseIpRoleBase : this->tmProgramCourseIpRoleBaseList) {
		if (tmProgramCourseIpRoleBase->programCourseId == oldId) {
			tmProgramCourseIpRoleBase->programCourseId = newId;
		}
	}
	this->tmProgramCourseIpRoleBaseIndex = std::make_shared<TmProgramCourseIpRoleBaseIndex>(this->tmProgramCourseIpRoleBaseList);

	//TmProgramCourseIpRoleQual
	for (auto& tmProgramCourseIpRoleQual : this->tmProgramCourseIpRoleQualList) {
		if (tmProgramCourseIpRoleQual->programCourseId == oldId) {
			tmProgramCourseIpRoleQual->programCourseId = newId;
		}
	}
	this->tmProgramCourseIpRoleQualIndex = std::make_shared<TmProgramCourseIpRoleQualIndex>(this->tmProgramCourseIpRoleQualList);

	//TmProgramCourseIpck
	for (auto& tmProgramCourseIpck : this->tmProgramCourseIpckList) {
		if (tmProgramCourseIpck->tmProgramCourseId == oldId) {
			tmProgramCourseIpck->tmProgramCourseId = newId;
		}
	}
	this->tmProgramCourseIpckIndex = std::make_shared<TmProgramCourseIpckIndex>(this->tmProgramCourseIpckList);

	//TmProgramCourseMore
	for (auto& tmProgramCourseMore : this->tmProgramCourseMoreList) {
		if (tmProgramCourseMore->tmProgramCourseId == oldId) {
			tmProgramCourseMore->tmProgramCourseId = newId;
		}
	}
	this->tmProgramCourseMoreIndex = std::make_shared<TmProgramCourseMoreIndex>(this->tmProgramCourseMoreList);

	//TmProgramCourseMoreLeg
	for (auto& tmProgramCourseMoreLeg : this->tmProgramCourseMoreLegList) {
		if (tmProgramCourseMoreLeg->tmProgramCourseId == oldId) {
			tmProgramCourseMoreLeg->tmProgramCourseId = newId;
		}
	}
	this->tmProgramCourseMoreLegIndex = std::make_shared<TmProgramCourseMoreLegIndex>(this->tmProgramCourseMoreLegList);
}

void CrewDataContext::updateTmProgramCourseInstructorId(const long long oldId, const long long newId) {
	//无引用programCourseInstructorId
}

void CrewDataContext::updateTmProgramCoursePnrId(const long long oldId, const long long newId) {
	//TmProgramCourseLimitation
	for (auto& tmProgramCourseLimitation : this->tmProgramCourseLimitationList) {
		if (tmProgramCourseLimitation->programCoursePnrId == oldId) {
			tmProgramCourseLimitation->programCoursePnrId = newId;
		}
	}
	this->tmProgramCourseLimitationIndex = std::make_shared<TmProgramCourseLimitationIndex>(this->tmProgramCourseLimitationList);

	//TmProgramCourseRole
	for (auto& tmProgramCourseRole : this->tmProgramCourseRoleList) {
		if (tmProgramCourseRole->programCoursePnrId == oldId) {
			tmProgramCourseRole->programCoursePnrId = newId;
		}
	}
	this->tmProgramCourseRoleIndex = std::make_shared<TmProgramCourseRoleIndex>(this->tmProgramCourseRoleList);

	//TmProgramCourseRoleQual
	for (auto& tmProgramCourseRoleQual : this->tmProgramCourseRoleQualList) {
		if (tmProgramCourseRoleQual->programCoursePnrId == oldId) {
			tmProgramCourseRoleQual->programCoursePnrId = newId;
		}
	}
	this->tmProgramCourseRoleQualIndex = std::make_shared<TmProgramCourseRoleQualIndex>(this->tmProgramCourseRoleQualList);

	//TmProgramCourseRoleLimitation
	for (auto& tmProgramCourseRoleLimitation : this->tmProgramCourseRoleLimitationList) {
		if (tmProgramCourseRoleLimitation->programCoursePnrId == oldId) {
			tmProgramCourseRoleLimitation->programCoursePnrId = newId;
		}
	}
	this->tmProgramCourseRoleLimitationIndex = std::make_shared<TmProgramCourseRoleLimitationIndex>(this->tmProgramCourseRoleLimitationList);

	//TmProgramCourseIpRole
	for (auto& tmProgramCourseIpRole : this->tmProgramCourseIpRoleList) {
		if (tmProgramCourseIpRole->programCoursePnrId == oldId) {
			tmProgramCourseIpRole->programCoursePnrId = newId;
		}
	}
	this->tmProgramCourseIpRoleIndex = std::make_shared<TmProgramCourseIpRoleIndex>(this->tmProgramCourseIpRoleList);

	//TmProgramCourseIpRoleBase
	for (auto& tmProgramCourseIpRoleBase : this->tmProgramCourseIpRoleBaseList) {
		if (tmProgramCourseIpRoleBase->programCoursePnrId == oldId) {
			tmProgramCourseIpRoleBase->programCoursePnrId = newId;
		}
	}
	this->tmProgramCourseIpRoleBaseIndex = std::make_shared<TmProgramCourseIpRoleBaseIndex>(this->tmProgramCourseIpRoleBaseList);

	//TmProgramCourseIpRoleQual
	for (auto& tmProgramCourseIpRoleQual : this->tmProgramCourseIpRoleQualList) {
		if (tmProgramCourseIpRoleQual->programCoursePnrId == oldId) {
			tmProgramCourseIpRoleQual->programCoursePnrId = newId;
		}
	}
	this->tmProgramCourseIpRoleQualIndex = std::make_shared<TmProgramCourseIpRoleQualIndex>(this->tmProgramCourseIpRoleQualList);

	//TmProgramCourseIpck
	for (auto& tmProgramCourseIpck : this->tmProgramCourseIpckList) {
		if (tmProgramCourseIpck->tmProgramCoursePnrId == oldId) {
			tmProgramCourseIpck->tmProgramCoursePnrId = newId;
		}
	}
	this->tmProgramCourseIpckIndex = std::make_shared<TmProgramCourseIpckIndex>(this->tmProgramCourseIpckList);

	//TmProgramCourseMore
	for (auto& tmProgramCourseMore : this->tmProgramCourseMoreList) {
		if (tmProgramCourseMore->tmProgramCoursePnrId == oldId) {
			tmProgramCourseMore->tmProgramCoursePnrId = newId;
		}
	}
	this->tmProgramCourseMoreIndex = std::make_shared<TmProgramCourseMoreIndex>(this->tmProgramCourseMoreList);

	//TmProgramCourseMoreLeg
	for (auto& tmProgramCourseMoreLeg : this->tmProgramCourseMoreLegList) {
		if (tmProgramCourseMoreLeg->tmProgramCoursePnrId == oldId) {
			tmProgramCourseMoreLeg->tmProgramCoursePnrId = newId;
		}
	}
	this->tmProgramCourseMoreLegIndex = std::make_shared<TmProgramCourseMoreLegIndex>(this->tmProgramCourseMoreLegList);

}

void CrewDataContext::updateTmProgramCourseMoreId(const long long oldId, const long long newId) {
	//TmProgramCourseMoreLeg
	for (auto& tmProgramCourseMoreLeg : this->tmProgramCourseMoreLegList) {
		if (tmProgramCourseMoreLeg->tmProgramCourseMoreId == oldId) {
			tmProgramCourseMoreLeg->tmProgramCourseMoreId = newId;
		}
	}
	this->tmProgramCourseMoreLegIndex = std::make_shared<TmProgramCourseMoreLegIndex>(this->tmProgramCourseMoreLegList);
}

void CrewDataContext::updateTmProgramId(const long long oldId, const long long newId) {
	//TmProgramCourse
	for (auto& pair : this->tmProgramCourseMap) {
		auto& tmProgramCourse = pair.second;
		if (tmProgramCourse->programId == oldId) {
			tmProgramCourse->programId = newId;
		}
	}
	//所有目前没有使用programId作为索引，因此不需要重建索引
	this->tmProgramCourseIndex = std::make_shared<TmProgramCourseIndex>(this->tmProgramCourseMap);

	//TmProgramCoursePnr
	for (auto& tmProgramCoursePnr : this->tmProgramCoursePnrList) {
		if (tmProgramCoursePnr->programId == oldId) {
			tmProgramCoursePnr->programId = newId;
		}
	}
	//所有目前没有使用programId作为索引，因此不需要重建索引
	//this->tmProgramCoursePnrIndex = std::make_shared<TmProgramCoursePnrIndex>(this->tmProgramCoursePnrList);

	//TmProgramCourseIpck
	for (auto& tmProgramCourseIpck : this->tmProgramCourseIpckList) {
		if (tmProgramCourseIpck->programId == oldId) {
			tmProgramCourseIpck->programId = newId;
		}
	}
	//所有目前没有使用programId作为索引，因此不需要重建索引
	//this->tmProgramCourseIpckIndex = std::make_shared<TmProgramCourseIpckIndex>(this->tmProgramCourseIpckList);

	//TmProgramBuddyCourse
	for (auto& tmProgramBuddyCourse : this->tmProgramBuddyCourseList) {
		if (tmProgramBuddyCourse->programId == oldId) {
			tmProgramBuddyCourse->programId = newId;
		}
	}
	//所有目前没有使用programId作为索引，因此不需要重建索引
	this->tmProgramBuddyCourseIndex = std::make_shared<TmProgramBuddyCourseIndex>(this->tmProgramBuddyCourseList);

	//TmProgramPip
	for (auto& tmProgramPip : this->tmProgramPipList) {
		if (tmProgramPip->programId == oldId) {
			tmProgramPip->programId = newId;
		}
	}
	//所有目前没有使用programId作为索引，因此不需要重建索引
	this->tmProgramPipIndex = std::make_shared<TmProgramPipIndex>(this->tmProgramPipList);

	//TmProgramCourseLimitation
	for (auto& tmProgramCourseLimitation : this->tmProgramCourseLimitationList) {
		if (tmProgramCourseLimitation->programId == oldId) {
			tmProgramCourseLimitation->programId = newId;
		}
	}
	//所有目前没有使用programId作为索引，因此不需要重建索引
	//this->tmProgramCourseLimitationIndex = std::make_shared<TmProgramCourseLimitationIndex>(this->tmProgramCourseLimitationList);

	//TmProgramCourseRole
	for (auto& tmProgramCourseRole : this->tmProgramCourseRoleList) {
		if (tmProgramCourseRole->programId == oldId) {
			tmProgramCourseRole->programId = newId;
		}
	}
	//所有目前没有使用programId作为索引，因此不需要重建索引
	//this->tmProgramCourseRoleIndex = std::make_shared<TmProgramCourseRoleIndex>(this->tmProgramCourseRoleList);

	//TmProgramCourseRoleQual
	for (auto& tmProgramCourseRoleQual : this->tmProgramCourseRoleQualList) {
		if (tmProgramCourseRoleQual->programId == oldId) {
			tmProgramCourseRoleQual->programId = newId;
		}
	}
	//所有目前没有使用programId作为索引，因此不需要重建索引
	//this->tmProgramCourseRoleQualIndex = std::make_shared<TmProgramCourseRoleQualIndex>(this->tmProgramCourseRoleQualList);

	//TmProgramCourseRoleLimitation
	for (auto& tmProgramCourseRoleLimitation : this->tmProgramCourseRoleLimitationList) {
		if (tmProgramCourseRoleLimitation->programId == oldId) {
			tmProgramCourseRoleLimitation->programId = newId;
		}
	}
	//所有目前没有使用programId作为索引，因此不需要重建索引
	//this->tmProgramCourseRoleLimitationIndex = std::make_shared<TmProgramCourseRoleLimitationIndex>(this->tmProgramCourseRoleLimitationList);

	//TmProgramCourseIpRole
	for (auto& tmProgramCourseIpRole : this->tmProgramCourseIpRoleList) {
		if (tmProgramCourseIpRole->programId == oldId) {
			tmProgramCourseIpRole->programId = newId;
		}
	}
	//所有目前没有使用programId作为索引，因此不需要重建索引
	//this->tmProgramCourseIpRoleIndex = std::make_shared<TmProgramCourseIpRoleIndex>(this->tmProgramCourseIpRoleList);

	//TmProgramCourseIpRoleBase
	for (auto& tmProgramCourseIpRoleBase : this->tmProgramCourseIpRoleBaseList) {
		if (tmProgramCourseIpRoleBase->programId == oldId) {
			tmProgramCourseIpRoleBase->programId = newId;
		}
	}
	//所有目前没有使用programId作为索引，因此不需要重建索引
	//this->tmProgramCourseIpRoleBaseIndex = std::make_shared<TmProgramCourseIpRoleBaseIndex>(this->tmProgramCourseIpRoleBaseList);

	//TmProgramCourseIpRoleQual
	for (auto& tmProgramCourseIpRoleQual : this->tmProgramCourseIpRoleQualList) {
		if (tmProgramCourseIpRoleQual->programId == oldId) {
			tmProgramCourseIpRoleQual->programId = newId;
		}
	}
	//所有目前没有使用programId作为索引，因此不需要重建索引
	//this->tmProgramCourseIpRoleQualIndex = std::make_shared<TmProgramCourseIpRoleQualIndex>(this->tmProgramCourseIpRoleQualList);

	//TmProgramCourseMore
	for (auto& tmProgramCourseMore : this->tmProgramCourseMoreList) {
		if (tmProgramCourseMore->programId == oldId) {
			tmProgramCourseMore->programId = newId;
		}
	}
	//所有目前没有使用programId作为索引，因此不需要重建索引
	//this->tmProgramCourseMoreIndex = std::make_shared<TmProgramCourseMoreIndex>(this->tmProgramCourseMoreList);

	//TmProgramCourseMoreLeg
	for (auto& tmProgramCourseMoreLeg : this->tmProgramCourseMoreLegList) {
		if (tmProgramCourseMoreLeg->programId == oldId) {
			tmProgramCourseMoreLeg->programId = newId;
		}
	}
	//所有目前没有使用programId作为索引，因此不需要重建索引
	this->tmProgramCourseMoreLegIndex = std::make_shared<TmProgramCourseMoreLegIndex>(this->tmProgramCourseMoreLegList);

	//TmProgramBuddy
	for (auto& tmProgramBuddy : this->tmProgramBuddyList) {
		if (tmProgramBuddy->tmProgramId == oldId) {
			tmProgramBuddy->tmProgramId = newId;
		}
	}
	//所有目前没有使用programId作为索引，因此不需要重建索引
	//this->tmProgramBuddyIndex = std::make_shared<TmProgramBuddyIndex>(this->tmProgramBuddyList);

	//TmProgramBuddyTime
	for (auto& tmProgramBuddyTime : this->tmProgramBuddyTimeList) {
		if (tmProgramBuddyTime->buddyProgramId == oldId) {
			tmProgramBuddyTime->buddyProgramId = newId;
		}
	}
	//所有目前没有使用programId作为索引，因此不需要重建索引
	this->tmProgramBuddyTimeIndex = std::make_shared<TmProgramBuddyTimeIndex>(this->tmProgramBuddyTimeList);
}

void CrewDataContext::updateTmProgramBuddyId(const long long oldId, const long long newId) {
	//TmProgramBuddyCourse
	for (auto& tmProgramBuddyCourse : this->tmProgramBuddyCourseList) {
		if (tmProgramBuddyCourse->programBuddyId == oldId) {
			tmProgramBuddyCourse->programBuddyId = newId;
		}
	}
	this->tmProgramBuddyCourseIndex = std::make_shared<TmProgramBuddyCourseIndex>(this->tmProgramBuddyCourseList);

	//TmProgramBuddyTime
	for (auto& tmProgramBuddyTime : this->tmProgramBuddyTimeList) {
		if (tmProgramBuddyTime->tmProgramBuddyId == oldId) {
			tmProgramBuddyTime->tmProgramBuddyId = newId;
		}
	}
	this->tmProgramBuddyTimeIndex = std::make_shared<TmProgramBuddyTimeIndex>(this->tmProgramBuddyTimeList);
}

void CrewDataContext::updateTmProgramBuddyTimeId(const long long oldId, const long long newId) {
	//TmProgramBuddyCourse
	for (auto& tmProgramBuddyCourse : this->tmProgramBuddyCourseList) {
		if (tmProgramBuddyCourse->programBuddyTimeId == oldId) {
			tmProgramBuddyCourse->programBuddyTimeId = newId;
		}
	}
	this->tmProgramBuddyCourseIndex = std::make_shared<TmProgramBuddyCourseIndex>(this->tmProgramBuddyCourseList);
}

void CrewDataContext::updateTmProgramBuddyCourseId(const long long oldId, const long long newId) {
	//无引用programBuddyCourseId
}


void CrewDataContext::updateTmProgramPipId(const long long oldId, const long long newId) {
	//无引用programPipId
}

void CrewDataContext::updateTmProgramCourseLimitationId(const long long oldId, const long long newId) {
	//无引用programCourseLimitationId
}

void CrewDataContext::updateTmProgramCourseRoleId(const long long oldId, const long long newId) {
	//TmProgramCourseRoleLimitation
	for (auto& tmProgramCourseRoleLimitation : this->tmProgramCourseRoleLimitationList) {
		if (tmProgramCourseRoleLimitation->programCourseRoleId == oldId) {
			tmProgramCourseRoleLimitation->programCourseRoleId = newId;
		}
	}
	this->tmProgramCourseRoleLimitationIndex = std::make_shared<TmProgramCourseRoleLimitationIndex>(this->tmProgramCourseRoleLimitationList);

	//TmProgramCourseRoleQual
	for (auto& tmProgramCourseRoleQual : this->tmProgramCourseRoleQualList) {
		if (tmProgramCourseRoleQual->programCourseRoleId == oldId) {
			tmProgramCourseRoleQual->programCourseRoleId = newId;
		}
	}
	this->tmProgramCourseRoleQualIndex = std::make_shared<TmProgramCourseRoleQualIndex>(this->tmProgramCourseRoleQualList);
}

void CrewDataContext::updateTmProgramCourseRoleQualId(const long long oldId, const long long newId) {
	//无引用programCourseRoleQualId
}

//使用programCourseIpRoleId的类，重新更新ID
void CrewDataContext::updateTmProgramCourseIpRoleId(const long long oldId, const long long newId) {
	//TmProgramCourseIpRoleBase
	for (auto& tmProgramCourseIpRoleBase : this->tmProgramCourseIpRoleBaseList) {
		if (tmProgramCourseIpRoleBase->programCourseIpRoleId == oldId) {
			tmProgramCourseIpRoleBase->programCourseIpRoleId = newId;
		}
	}
	this->tmProgramCourseIpRoleBaseIndex = std::make_shared<TmProgramCourseIpRoleBaseIndex>(this->tmProgramCourseIpRoleBaseList);

	//TmProgramCourseIpRoleQual
	for (auto& tmProgramCourseIpRoleQual : this->tmProgramCourseIpRoleQualList) {
		if (tmProgramCourseIpRoleQual->programCourseIpRoleId == oldId) {
			tmProgramCourseIpRoleQual->programCourseIpRoleId = newId;
		}
	}
	this->tmProgramCourseIpRoleQualIndex = std::make_shared<TmProgramCourseIpRoleQualIndex>(this->tmProgramCourseIpRoleQualList);
}

//使用programCourseIpRoleBaseId的类，重新更新ID
void CrewDataContext::updateTmProgramCourseIpRoleBaseId(const long long oldId, const long long newId) {
	//TmProgramCourseIpRoleQual
	for (auto& tmProgramCourseIpRoleQual : this->tmProgramCourseIpRoleQualList) {
		if (tmProgramCourseIpRoleQual->programCourseIpRoleBaseId == oldId) {
			tmProgramCourseIpRoleQual->programCourseIpRoleBaseId = newId;
		}
	}
	this->tmProgramCourseIpRoleQualIndex = std::make_shared<TmProgramCourseIpRoleQualIndex>(this->tmProgramCourseIpRoleQualList);
}

//使用programCourseIpRoleQualId的类，重新更新ID
void CrewDataContext::updateTmProgramCourseIpRoleQualId(const long long oldId, const long long newId) {
	//无引用programCourseIpRoleQual
}

void CrewDataContext::updateTmProgramCourseRoleLimitationId(const long long oldId, const long long newId) {
	//无引用programCourseRoleLimitationId
}

void CrewDataContext::updateTmProgramCourseIpckId(const long long oldId, const long long newId) {
	//无引用programCourseIpckId
}


void CrewDataContext::updateTmProgramCourseMoreLegId(const long long oldId, const long long newId) {
	//无引用programCourseMoreLegId
}

void CrewDataContext::updateTmDeviceTimeId(const long long oldId, const long long newId) {
	//TmProgramCourse
	for (auto& pair : this->tmProgramCourseMap) {
		auto& tmProgramCourse = pair.second;
		if (tmProgramCourse->deviceTimeId == oldId) {
			tmProgramCourse->deviceTimeId = newId;
		}
	}
	//所有目前没有使用deviceTimeId作为索引，因此不需要重建作为索引
	//this->tmProgramCourseIndex = std::make_shared<TmProgramCourseIndex>(this->tmProgramCourseMap);
}

//获得默认机组人员配比
std::string CrewDataContext::getDefaultComposition(const string& defaultCompositionMode) {
	//计算无法获取配比时，采用默认配比
	if (defaultCompositionMode.empty() || defaultCompositionMode == "NA") {
		return "";
	}
	if (_defaultComposition.empty()) {
		if (defaultCompositionMode == "MIN") {
			//默认配比获取composition.displayOrder的最小值(一般场景，例如：EVA)
			int hierarchy = INT_MAX;//界面显示字段名：Priority
			for (auto& composition : this->compositionList) {
				if (composition.getDivision() == this->scenario.division) {
					if (composition.getHierarchy() < hierarchy) {
						hierarchy = composition.getHierarchy();
						_defaultComposition = composition.getName();
					}
				}
			}
		}
		else if (defaultCompositionMode == "MAX") {
			////默认配比获取composition.displayOrder的最大值(特殊场景)
			//int hierarchy = INT_MIN;
			//for (auto& composition : this->compositionList) {
			//	if (composition.getDivision() == this->scenario.division) {
			//		if (composition.getHierarchy() > hierarchy) {
			//			hierarchy = composition.getHierarchy();
			//			_defaultComposition = composition.getName();
			//		}
			//	}
			//}
		}
	}
	return _defaultComposition;
}

//获得主基地时区
int CrewDataContext::getMainBaseTimeZone() const {
	if (_mainBaseOffsetTZMinutes == -1) {
		auto iter = systemParamMap.find("CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE");
		if (iter != systemParamMap.end()) {
			auto& defaultTimezoneBase = iter->second;
			string zoneId = getAirportZoneId(defaultTimezoneBase);
			_mainBaseOffsetTZMinutes = TimezoneUtils::GetTimezoneOffset(time(0), zoneId);
		}
	}
	return _mainBaseOffsetTZMinutes;
}

double CrewDataContext::getRouteRadiationConfigBySegment(const Segment* seg) {
	double radiationValue = 0.0;
	for (auto& routeRadiationConfig : this->routeRadiationConfigList) {
		time_t segEndDay = getLocalDayStartInUTC(seg->getEndTimeLocAct(), 0);
		if (routeRadiationConfig.fleet == seg->getFleetCD()
			&& routeRadiationConfig.depArp == seg->getDepStation()
			&& routeRadiationConfig.arvArp == seg->getArrStation()
			&& routeRadiationConfig.effDt <= seg->getStartTimeLocAct()
			&& routeRadiationConfig.expDt >= segEndDay) {
			radiationValue = routeRadiationConfig.radiationDose;
			break;
		}
	}
	return radiationValue;
}

double CrewDataContext::getRouteRadiationConfigBySegmentAndTime(const Segment* seg, const time_t day) {
	double radiationValue = 0.0;
	for (auto& routeRadiationConfig : this->routeRadiationConfigList) {
		time_t segEndDay = getLocalDayStartInUTC(seg->getEndTimeLocAct(), 0);
		if (routeRadiationConfig.fleet == seg->getFleetCD()
			&& routeRadiationConfig.depArp == seg->getDepStation()
			&& routeRadiationConfig.arvArp == seg->getArrStation()
			&& routeRadiationConfig.effDt <= day
			&& routeRadiationConfig.expDt >= day) {
			radiationValue = routeRadiationConfig.radiationDose;
			break;
		}
	}
	return radiationValue;
}

void CrewDataContext::makeSegmentToPairingMap() {
	Logger::getRuleLogger()->info("[CrewDataContext::makeSegmentToPairingMap] start, flightIdToPairing size:{}", this->flightIdToPairing.size());
	vector<Pairing*>& pairingList = this->pairingList;
	this->flightIdToPairing.clear();
	for (auto& p : pairingList) {
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				//20181109 ain, mantis#4408, rankComb计算过程忽略DHD
				if (!s->getIsOperating() || s->getAssignment() == "DHD" || s->getAssignment() == "BUS") {
					continue;
				}
				long long fltId = s->getDBId();
				if (this->flightIdToPairing.find(fltId) == this->flightIdToPairing.end()) {
					this->flightIdToPairing[fltId] = vector<long long>();
				}
				long long a = p->getDbId();
				this->flightIdToPairing[fltId].push_back(p->getDbId());
			}
		}
	}
	Logger::getRuleLogger()->info("[CrewDataContext::makeSegmentToPairingMap] end, flightIdToPairing size:{}", this->flightIdToPairing.size());
}

//检查roster是否overlap
//pairingId相同 或 rosterId相同视为overlap
//overlap返回true，否则返回false
bool isOverlapBetweenTwoRoster(ErrorContext * errCtx, map<string, bool>& overlapableAssignmentMap, SharedPtr<ROSTER>& roster1, SharedPtr<ROSTER>& roster2) {
	bool isOverlap = false;

	//ToDO 计划将来把这两个函数重构和整合
	//bool LegalityChecker::isOverlap(SharedPtr<CREW> crew, vector<shared_ptr<Pairing>> pairings)

	//mantis#1928, 对比 roster相同且！=0时skip, pairingId相同时认为overlap
	if (roster1->rosterId == roster2->rosterId && roster1->rosterId != 0) {
		isOverlap = true;
	}
	if (roster1->pairId == roster2->pairId && roster1->pairId != 0) {
		isOverlap = true;
	}

	//两个预占之间overlap不做检查，Garbage in/ Garbage out
	if (roster1->source == "PA" && roster2->source == "PA") {
		return false;
	}

	//若assignment=overlapable，则不做overlap检查
	string assignment1 = roster1->duty;
	string assignment2 = roster2->duty;
	if (overlapableAssignmentMap[assignment1]
		&& overlapableAssignmentMap[assignment2]) {
		return false;
	}

	time_t lstart = roster1->strUtc;
	time_t lend = roster1->restStrUtc;
	time_t rstart = roster2->strUtc;
	time_t rend = roster2->restStrUtc;
	if (overlapableAssignmentMap.find("RST") == overlapableAssignmentMap.end() &&
		overlapableAssignmentMap.find("REST") == overlapableAssignmentMap.end())
	{
		lend = roster1->endUtc;
		rend = roster2->endUtc;//若RST不在 group=overlapable，则按rest end time检查
	}

	if ((lstart < rend) && (lend > rstart)){
		isOverlap = true;
	}

	//errorMsg
	if (isOverlap) {
		time_t rstart = roster2->strUtc;
		time_t rend = roster2->restStrUtc;
		char startBuf1[100] = { 0 };
		char endBuf1[100] = { 0 };
		char startBuf2[100] = { 0 };
		char endBuf2[100] = { 0 };
		utcToUtcStr(lstart, startBuf1, sizeof(startBuf1));
		utcToUtcStr(lend, endBuf1, sizeof(endBuf1));
		utcToUtcStr(rstart, startBuf2, sizeof(startBuf2));
		utcToUtcStr(rend, endBuf2, sizeof(endBuf2));

		errCtx->errorCode = ERR_OVERLAP;
		_snprintf(errCtx->errorMsgBuf, sizeof(errCtx->errorMsgBuf), "overlap crew=%s between roster[%lld, pair=%lld, %s, %s, %s, %s] and roster[%lld, pair=%lld, %s, %s, %s, %s]",
			roster1->idcrew.c_str(), roster1->rosterId, roster1->pairId, roster1->duty.c_str(), utcToMMDDHHmmString(roster1->strUtc).c_str(), utcToMMDDHHmmString(roster1->restStrUtc).c_str(), utcToMMDDHHmmString(roster1->endUtc).c_str(),
			roster2->rosterId, roster2->pairId, roster2->duty.c_str(), utcToMMDDHHmmString(roster2->strUtc).c_str(), utcToMMDDHHmmString(roster2->restStrUtc).c_str(), utcToMMDDHHmmString(roster2->endUtc).c_str());
	}
	return isOverlap;
}


//检查roster是否与crew已有roster overlap
//如果存在，在errCtx中保存错误信息
void checkOverlapForRosterOnCrew(ErrorContext * errCtx, map<string, bool>& overlapableAssignmentMap, SharedPtr<ROSTER>& roster, SharedPtr<CREW>& crew) {

	std::size_t i = 0;
	std::size_t nRosters = crew->rosterList.size();

	time_t lstart = roster->strUtc;
	time_t lend = roster->restStrUtc;
	SharedPtr<ROSTER> overlapRoster;

	for (i = 0; i < nRosters; i++){
		if (isOverlapBetweenTwoRoster(errCtx, overlapableAssignmentMap, roster, crew->rosterList[i])) {
			return;
		}
	}
}

//检查各个crew下pairing是否存在overlap
//如果存在，在errCtx中保存错误信息
void checkOverlap(ErrorContext * errCtx, map<string, bool>& overlapableAssignmentMap, vector<SharedPtr<CREW>> &crewList) {
	for (std::size_t n = 0; n < crewList.size(); n++) {
		SharedPtr<CREW> crew = crewList[n];
		int nRosters = (int)crew->rosterList.size();

		sortRosterByStrUtc(crew->rosterList);

		for (int p = 0; p < nRosters - 1; p++) {
			if (isOverlapBetweenTwoRoster(errCtx, overlapableAssignmentMap, crew->rosterList[p], crew->rosterList[p + 1])) {
				return;
			}
		}
	}
}



string CrewDataContext::findAirportCountry(const string &airport) {

	if (airportCodeMap.empty()) {
		for (std::size_t i = 0; i < this->airportList.size(); i++) {
			airportCodeMap[airportList[i].airport] = &airportList[i];
		}
	}

	if (airportCodeMap.find(airport) == airportCodeMap.end()) {
		//20190528 ain, mantis#5745, 增加 default airport机制, 尽可能减少crash
		if (AirportDefault::instance().isDefaultExist(airport)) {
			string country = AirportDefault::instance().getCountry(airport);
			return country;
		}
		else {
			Logger::getRuleLogger()->error("airport '{}' not found, findAirportCountry fail", airport);
			return "unknown";
		}
	}
	return airportCodeMap[airport]->country;
}

//默认时区
//如计算 readPairingFairness()时使用
int CrewDataContext::getDefaultTimeZone() {
	return 8;
}

void CrewDataContext::compareDataCtx(SharedPtr<CrewDataContext> other, string otherName) {
	cout << "this=" << this->scenarioId << "  other=" << other->scenarioId << endl;
	if (this->otherScenarioInSameGroup.size() != other->otherScenarioInSameGroup.size()) cout << "Not equal otherScenarioInSameGroup, this.size=" << this->otherScenarioInSameGroup.size() << " " << otherName << "->otherScenarioInSameGroup.size=" << other->otherScenarioInSameGroup.size() << endl;
	if (this->pairingList.size() != other->pairingList.size()) cout << "Not equal pairingList, this.size=" << this->pairingList.size() << " " << otherName << "->pairingList.size=" << other->pairingList.size() << endl;
	if (this->pairingListForRO.size() != other->pairingListForRO.size()) cout << "Not equal pairingListForRO, this.size=" << this->pairingListForRO.size() << " " << otherName << "->pairingListForRO.size=" << other->pairingListForRO.size() << endl;
	if (this->pairingListForROWithOpenComposition.size() != other->pairingListForROWithOpenComposition.size()) cout << "Not equal pairingListForROWithOpenComposition, this.size=" << this->pairingListForROWithOpenComposition.size() << " " << otherName << "->pairingListForROWithOpenComposition.size=" << other->pairingListForROWithOpenComposition.size() << endl;
	if (this->preAssignPairingList.size() != other->preAssignPairingList.size()) cout << "Not equal preAssignPairingList, this.size=" << this->preAssignPairingList.size() << " " << otherName << "->preAssignPairingList.size=" << other->preAssignPairingList.size() << endl;

	if (this->crewList.size() != other->crewList.size()) cout << "Not equal crewList, this.size=" << this->crewList.size() << " " << otherName << "->crewList.size=" << other->crewList.size() << endl;
	if (this->crewTotalList.size() != other->crewTotalList.size()) cout << "Not equal crewTotalList, this.size=" << this->crewTotalList.size() << " " << otherName << "->crewTotalList.size=" << other->crewTotalList.size() << endl;
	if (this->crewIdMap.size() != other->crewIdMap.size()) cout << "Not equal crewIdMap, this.size=" << this->crewIdMap.size() << " " << otherName << "->crewIdMap.size=" << other->crewIdMap.size() << endl;
	if (this->ruleList.size() != other->ruleList.size()) cout << "Not equal ruleList, this.size=" << this->ruleList.size() << " " << otherName << "->ruleList.size=" << other->ruleList.size() << endl;
	if (this->cqfList.size() != other->cqfList.size()) cout << "Not equal cqfList, this.size=" << this->cqfList.size() << " " << otherName << "->cqfList.size=" << other->cqfList.size() << endl;
	if (this->cqfList2.size() != other->cqfList2.size()) cout << "Not equal cqfList2, this.size=" << this->cqfList2.size() << " " << otherName << "->cqfList2.size=" << other->cqfList2.size() << endl;
	if (this->holidays.size() != other->holidays.size()) cout << "Not equal holidays, this.size=" << this->holidays.size() << " " << otherName << "->holidays.size=" << other->holidays.size() << endl;
	if (this->airportList.size() != other->airportList.size()) cout << "Not equal airportList, this.size=" << this->airportList.size() << " " << otherName << "->airportList.size=" << other->airportList.size() << endl;
	if (this->rankList.size() != other->rankList.size()) cout << "Not equal rankList, this.size=" << this->rankList.size() << " " << otherName << "->rankList.size=" << other->rankList.size() << endl;
	if (this->portQualReqmnts.size() != other->portQualReqmnts.size()) cout << "Not equal portQualReqmnts, this.size=" << this->portQualReqmnts.size() << " " << otherName << "->portQualReqmnts.size=" << other->portQualReqmnts.size() << endl;
	if (this->portQualReqmntsAirportMap.size() != other->portQualReqmntsAirportMap.size()) cout << "Not equal portQualReqmntsAirportMap, this.size=" << this->portQualReqmntsAirportMap.size() << " " << otherName << "->portQualReqmntsAirportMap.size=" << other->portQualReqmntsAirportMap.size() << endl;

	if (this->airportUtcOffsetMap.size() != other->airportUtcOffsetMap.size()) cout << "Not equal airportUtcOffsetMap, this.size=" << this->airportUtcOffsetMap.size() << " " << otherName << "->airportUtcOffsetMap.size=" << other->airportUtcOffsetMap.size() << endl;
	if (this->crewOnPairing.size() != other->crewOnPairing.size()) cout << "Not equal crewOnPairing, this.size=" << this->crewOnPairing.size() << " " << otherName << "->crewOnPairing.size=" << other->crewOnPairing.size() << endl;

	if (this->crewOnFlt.size() != other->crewOnFlt.size()) cout << "Not equal crewOnFlt, this.size=" << this->crewOnFlt.size() << " " << otherName << "->crewOnFlt.size=" << other->crewOnFlt.size() << endl;
	if (this->rankActingList.size() != other->rankActingList.size()) cout << "Not equal rankActingList, this.size=" << this->rankActingList.size() << " " << otherName << "->rankActingList.size=" << other->rankActingList.size() << endl;
	if (this->crossRankRuleList.size() != other->crossRankRuleList.size()) cout << "Not equal crossRankRuleList, this.size=" << this->crossRankRuleList.size() << " " << otherName << "->crossRankRuleList.size=" << other->crossRankRuleList.size() << endl;
	if (this->rule_8014.size() != other->rule_8014.size()) cout << "Not equal rule_8014, this.size=" << this->rule_8014.size() << " " << otherName << "->rule_8014.size=" << other->rule_8014.size() << endl;
	if (this->recencyMgr.getRecencyMap().size() != other->recencyMgr.getRecencyMap().size()) cout << "Not equal recencyMgr, this.size=" << this->recencyMgr.getRecencyMap().size() << " " << otherName << "->recencyMgr.size=" << other->recencyMgr.getRecencyMap().size() << endl;

	if (this->systemParamMap.size() != other->systemParamMap.size()) cout << "Not equal systemParamMap, this.size=" << this->systemParamMap.size() << " " << otherName << "->systemParamMap.size=" << other->systemParamMap.size() << endl;

	if (this->configDataSource.size() != other->configDataSource.size()) cout << "Not equal configDataSource, this.size=" << this->configDataSource.size() << " " << otherName << "->configDataSource.size=" << other->configDataSource.size() << endl;
	if (this->configDataSourceUrl.size() != other->configDataSourceUrl.size()) cout << "Not equal configDataSourceUrl, this.size=" << this->configDataSourceUrl.size() << " " << otherName << "->configDataSourceUrl.size=" << other->configDataSourceUrl.size() << endl;

	if (this->airportCodeMap.size() != other->airportCodeMap.size()) cout << "Not equal airportCodeMap, this.size=" << this->airportCodeMap.size() << " " << otherName << "->airportCodeMap.size=" << other->airportCodeMap.size() << endl;
	if (this->assignmentNameGroupMap.size() != other->assignmentNameGroupMap.size()) cout << "Not equal assignmentNameGroupMap, this.size=" << this->assignmentNameGroupMap.size() << " " << otherName << "->assignmentNameGroupMap.size=" << other->assignmentNameGroupMap.size() << endl;
	if (this->indexRule8014DutyGrp.size() != other->indexRule8014DutyGrp.size()) cout << "Not equal indexRule8014DutyGrp, this.size=" << this->indexRule8014DutyGrp.size() << " " << otherName << "->indexRule8014DutyGrp.size=" << other->indexRule8014DutyGrp.size() << endl;
	if (this->overlapableAssignmentMap.size() != other->overlapableAssignmentMap.size()) cout << "Not equal overlapableAssignmentMap, this.size=" << this->overlapableAssignmentMap.size() << " " << otherName << "->overlapableAssignmentMap.size=" << other->overlapableAssignmentMap.size() << endl;
	if (this->totalAssignGrps.size() != other->totalAssignGrps.size()) cout << "Not equal totalAssignGrps, this.size=" << this->totalAssignGrps.size() << " " << otherName << "->totalAssignGrps.size=" << other->totalAssignGrps.size() << endl;
	if (this->baseList.size() != other->baseList.size()) cout << "Not equal baseList, this.size=" << this->baseList.size() << " " << otherName << "->baseList.size=" << other->baseList.size() << endl;
	if (this->fleetList.size() != other->fleetList.size()) cout << "Not equal fleetList, this.size=" << this->fleetList.size() << " " << otherName << "->fleetList.size=" << other->fleetList.size() << endl;
}

//按actingRank获取 crewRank
//1. 以actingRank.division筛选 crewRank
//2. 若actingRank为空则按 crew.division筛选 crewRank
map<string, RANK> rankNameMap;
SharedPtr<CREW_RANK> CrewDataContext::getCrewRankByActingRank(string crewId, time_t start, time_t end, string actingRank, string fleet) {
	if (crewIdMap.find(crewId) == crewIdMap.end()) {
		Logger::getRuleLogger()->error("invalid data, getCrewRank(crewId={}) crew not exists", crewId);
		return nullptr;
	}
	auto& crew = crewIdMap[crewId];
	//division
	string division = "";
	for (auto& i : rankList) {
		if (i.rank == actingRank) {
			division = i.division;
			break;
		}
	}

	if (division == "") {
		division = crew->division;
	}

	if (rankNameMap.empty()) {
		for (auto& r : rankList) {
			rankNameMap[r.rank] = r;
		}
	}

	for (auto& cr : crewIdMap[crewId]->rankList) {
		time_t eff = cr->effUtc;
		time_t exp = cr->expUtc;
		if (eff <= 0)
			eff = start;
		if (exp <= 0)
			exp = end;
		if (!(end<eff || start>exp))
		{
			if (rankMap[cr->rank].division != division || rankMap[cr->rank].rank != actingRank) {
				continue;
			}
			if (fleet != "" && fleet != cr->acType) {
				continue;
			}
			return cr;
		}
	}
	return NULL;
}

bool CrewDataContext::isLiveMode() const {
	return this->scenarioId == 0;
}

int CrewDataContext::getManualDiscretion(const std::string& discretionType) {
	if (!this->isLiveMode()) {
		return 0;
	}
	std::string paramKey = "";
	if (discretionType == DiscretionType::FDP) {
		paramKey = "FDP_Discretion";
	}
	else if (discretionType == DiscretionType::FT) {
		paramKey = "FT_Discretion";
	}
	else if (discretionType == DiscretionType::REST) {
		paramKey = "REST_Discretion";
	}
	else if (discretionType == DiscretionType::DP) {
		paramKey = "DP_Discretion";
	}
	else if (discretionType == DiscretionType::SECTOR) {
		paramKey = "Sector_Discretion";
	}
	if (paramKey.empty() || systemParamMap.find(paramKey) == systemParamMap.end()) {
		return 0;
	}
	string paramValue = systemParamMap[paramKey];
	return atoi(paramValue.c_str());
}

string CrewDataContext::getWeekdayStartFrom() {
	std::string paramKey = "WEEKDAY_START_FROM";
	if (systemParamMap.find(paramKey) == systemParamMap.end()) {
		return "SUN";
	}
	return strToUpper(systemParamMap[paramKey]);
}

string CrewDataContext::getSystemParamValue(const string& paramName, const string defaultValue) const {
	auto iter = this->systemParamMap.find(paramName);
	if (iter != this->systemParamMap.end()) {
		return strToUpper(iter->second);
	}
	return defaultValue;
}

//针对请求操作Pairing、Roster等时间，来修订场景开始时间和结束时间
void CrewDataContext::reviseScenarioStartAndEndTime(const vector<SharedPtr<Activity>>& itemList) {
	//TODO hexd 2024/04/25
	if (!this->_isRequestScope) {
		//当前不是法规服务化，申请操作则退出
		return;
	}

	if (itemList.empty()) {
		return;
	}
	//法规服务化后，全局缓存存储至少3个月以上数据。当前输入数据仅作用于当前请求范围时，需要根据检查数据(addRoster等操作)，
	//为了避免无意义的大跨度时间范围的检查和计算，调整临时缓存中场景的开始时间和结束时间。
	//计算规则：[申请开始日期所在月份前一个月的首日开始，申请结束日期所在月份下一个月末日结束]
	time_t requestStartTimeUtc = INT_MAX;
	time_t requestEndTimeUtc = INT_MIN;
	time_t requestStartTimeLoc = INT_MAX;
	time_t requestEndTimeLoc = INT_MIN;

	for (auto& item : itemList) {
		if (item->getStartTimeUtcAct() < requestStartTimeUtc) {
			requestStartTimeUtc = item->getStartTimeUtcAct();
			requestStartTimeLoc = item->getStartTimeLocAct();
		}
		if (item->getEndTimeUtcAct() > requestEndTimeUtc) {
			requestEndTimeUtc = item->getEndTimeUtcAct();
			requestEndTimeLoc = item->getEndTimeLocAct();
		}
	}
	time_t requestMonthStartLoc = Utility::GetInstancePtr()->getLocalMonthStartInUTC(requestStartTimeLoc, 0);
	time_t requestMonthEndLoc = Utility::GetInstancePtr()->getLocalMonthEndInUTC(requestEndTimeLoc, 0);

	time_t revisedScenarioStartLoc = Utility::GetInstancePtr()->getLocalMonthStartInUTC(requestMonthStartLoc - 24*3600, 0);
	time_t revisedScenarioEndLoc = Utility::GetInstancePtr()->getLocalMonthEndInUTC(requestMonthEndLoc + 24 * 3600, 0);

	//由于夏令时原因，可能存在一下偏差，但影响不大
	int offsetTZSeconds = static_cast<int>(requestStartTimeLoc - requestStartTimeUtc);
	this->scenario.startDtUTC = std::max(revisedScenarioStartLoc - offsetTZSeconds, this->scenario.startDtUTC);
	this->scenario.endDtUTC = std::min(revisedScenarioEndLoc - offsetTZSeconds, this->scenario.endDtUTC);

	this->scenario.startDtLoc = std::max(revisedScenarioStartLoc, this->scenario.startDtLoc);
	this->scenario.endDtLoc = std::min(revisedScenarioEndLoc, this->scenario.endDtLoc);

	//法规服务化修改Crew
	reviseCrewRosterAndManday();
	
}

//针对请求操作Pairing、Roster等时间，来修订场景开始时间和结束时间
void CrewDataContext::reviseCrewRosterAndManday() {
	if (!this->_isRequestScope) {
		//当前不是法规服务化，申请操作则退出
		return;
	}
	//for (auto& crew : crewList) {
	//	reviseCrewRosterAndManday(crew);
	//}
	for (auto& crewId : this->_requestRoster.changedCrewIds) {
		auto iter = this->crewIdMap.find(crewId);
		if (iter != this->crewIdMap.end()) {
			reviseCrewRosterAndManday(iter->second);
		}
	}
}

void CrewDataContext::reviseCrewRosterAndManday(SharedPtr<CREW>& crew) {
	if (!this->_isRequestScope) {
		//当前不是法规服务化，申请操作则退出
		return;
	}

	if (!this->_requestTransactionId.empty() && _requestTransactionCount > 0) {
		//当前法规服务化的在执行事务，事务第一个请求修改roster、manday数据，后续不在修改
		return;
	}

	//auto iter = _transactionCrewIdMap.find(crew->idCrew);
	//if (iter == _transactionCrewIdMap.end()) {
	//	return;
	//}

	auto& _scenario = this->scenario;

	crew->rosterList.erase(std::remove_if(crew->rosterList.begin(), crew->rosterList.end(),
		[_scenario](const auto& destRoster) {
			return (destRoster->actStrUtc < _scenario.startDtUTC || destRoster->actEndUtc > _scenario.endDtUTC);
		}), crew->rosterList.end());

	crew->mandayFdList.erase(std::remove_if(crew->mandayFdList.begin(), crew->mandayFdList.end(),
		[_scenario](const auto& destMandayFd) {
			return (destMandayFd->dateLoc > _scenario.endDtUTC);
		}), crew->mandayFdList.end());

	crew->mandayCcAmList.erase(std::remove_if(crew->mandayCcAmList.begin(), crew->mandayCcAmList.end(),
		[_scenario](const auto& destMandayCc) {
			return (destMandayCc->dateLoc > _scenario.endDtUTC);
		}), crew->mandayCcAmList.end());

	//auto& [transRosterList, transMandayFdList, transMandayCcAmList] = iter->second;

	//crew->rosterList.clear();
	//for (auto& roster : transRosterList) {
	//	if (roster->actStrUtc >= this->scenario.startDtUTC && roster->actEndUtc <= this->scenario.endDtUTC) {
	//		crew->rosterList.push_back(roster);
	//	}
	//}

	//crew->mandayFdList.clear();
	//for (auto& mandayFd : transMandayFdList) {
	//	if (mandayFd->dateLoc <= this->scenario.endDtUTC) {
	//		crew->mandayFdList.push_back(mandayFd);
	//	}
	//}

	//crew->mandayCcAmList.clear();
	//for (auto& mandayCc : transMandayCcAmList) {
	//	if (mandayCc->dateLoc <= this->scenario.endDtUTC) {
	//		crew->mandayCcAmList.push_back(mandayCc);
	//	}
	//}
}

void CrewDataContext::makeDictionaryMap() {
	for (auto& dictionary : this->dictionaryList) {
		if (dictionary->parentCode == ".") {
			continue;
		}
		vector<std::shared_ptr<Dictionary>> dictChildList = getDictionaryChildList(dictionary->parentCode, this->dictionaryList);
		this->dictionaryMap.insert(std::make_pair(dictionary->parentCode, dictChildList));
	}
}

vector<std::shared_ptr<Dictionary>> CrewDataContext::getDictionaryChildList(const std::string& parentCode, const vector<std::shared_ptr<Dictionary>>& allDictionaryList, const bool isLoadChild) {
	vector<std::shared_ptr<Dictionary>> dictList{};
	for (auto& dictionary : allDictionaryList) {
		if (dictionary->parentCode == parentCode) {
			dictList.push_back(dictionary);
			if (isLoadChild) {
				if (dictionary->code == parentCode) {
					Logger::getRuleLogger()->error("[ERROR] Dictionary code is the same as parent code. id = {}, code = {}", dictionary->id, dictionary->code);
					continue;
				}
				vector<std::shared_ptr<Dictionary>> dictChildList = getDictionaryChildList(dictionary->code, allDictionaryList, isLoadChild);
				dictList.insert(dictList.end(), dictChildList.begin(), dictChildList.end());

			}
		}
	}
	return dictList;
}

void CrewDataContext::makeAirportDistanceMap() {
	this->airportDistanceMap.clear();
	for (auto& base : this->baseList) {
		auto iterDepAirport = this->airportCodeMap.find(base.base);
        if (iterDepAirport == this->airportCodeMap.end()) {
			continue;
		}
		auto iterBaseDistance = this->airportDistanceMap.find(base.base);
		if (iterBaseDistance == this->airportDistanceMap.end()) {
			this->airportDistanceMap[base.base] = map<string, int>();
		}
		map<string, int>& arrAirportDistanceMap = this->airportDistanceMap[base.base];

		LatLng depAirportLoc = { iterDepAirport->second->latitude, iterDepAirport->second->longitude };
		for (auto& arrAirport : this->airportList) {
			if (arrAirport.airport == base.base) {
				continue;
			}
			LatLng arrAirportLoc = { arrAirport.latitude, arrAirport.longitude };
			int distance = Utility::GetInstancePtr()->calculateDistanceHaversine(depAirportLoc, arrAirportLoc);

			arrAirportDistanceMap[arrAirport.airport] = distance;
		}
	}
}

int CrewDataContext::getDistanceBetweenAirports(const string& depStation, const string& arrStation) const {
    int distance = getDistanceBetweenAirportsImpl(depStation, arrStation);
	if (distance < 0) {
		distance = getDistanceBetweenAirportsImpl(arrStation, depStation);
    }
	return distance;
}

int CrewDataContext::getDistanceBetweenAirportsImpl(const string& depStation, const string& arrStation) const {
    if (depStation == arrStation) {
		return 0;
	}
	auto iterDep = this->airportDistanceMap.find(depStation);
	if (iterDep == this->airportDistanceMap.end()) {
		return -1;
	}
	auto iterArr = iterDep->second.find(arrStation);
	if (iterArr == iterDep->second.end()) {
		return -1;
	}
	return iterArr->second;
}

void CrewDataContext::initDutyCodeAssignment() {
	DutyCode::DutyCodeConfig config;
	config.BuildDutyCodeConfig(dutyCodeTypeCompList, dutyCodeLogicMap);
	config.SetAssignFlySegment(scenario.division == "P"); // only P need assign fly segment duty code
	_dutyCodeAssignment = std::make_unique<DutyCode::DutyCodeAssignment>();
	_dutyCodeAssignment->SetDutyCodeConfig(std::move(config));
}

vector<SharedPtr<RULE_VIOLATION>>& CrewDataContext::getPrepareCheckRuleViolations() {
	return _prepareRuleViolations;
}

const string& CrewDataContext::getRequestTransactionId() const {
	return _requestTransactionId;
}

void CrewDataContext::setRequestTransactionId(const string value) {
	if (_requestTransactionId == value) {
		_requestTransactionCount++;
	}
	else {
		_requestTransactionId = value;
		_requestTransactionCount = 0;
	}
}

const string& CrewDataContext::getRequestTransactionStatus() const {
	return _requestTransactionStatus;
}

void CrewDataContext::setRequestTransactionStatus(const string value) {
	_requestTransactionStatus = value;
}

const std::size_t CrewDataContext::getRequestTransactionCount() const {
	return _requestTransactionCount;
}

RequestRoster& CrewDataContext::getRequestRoster() {
	return _requestRoster;
}

bool CrewDataContext::IsSupportRulePhaseConfig() {
	if (_isSupportRulePhaseConfig == nullptr) {
		string isRulePhase = getSystemParamValue("RULE_PHASE", "N");
		_isSupportRulePhaseConfig = std::make_shared<bool>(isRulePhase == "Y");
	}
	return *_isSupportRulePhaseConfig;

}

vector<Pairing*> CrewDataContext::getPairingList(const string& filiale, const string& division) const {
	if (filiale.empty() || division.empty()) {
		return this->pairingList;
	}
	vector<Pairing*> results;
	for (auto& pairing : this->pairingList) {
		if (pairing->getFiliale() == filiale && pairing->getDivision() == division) {
			results.emplace_back(pairing);
		}
	}
	return results;
}

vector<std::shared_ptr<CREW>> CrewDataContext::getCrewList(const string& filiale, const string& division) const {
	if (filiale.empty() || division.empty()) {
		return this->crewList;
	}
	vector<std::shared_ptr<CREW>> results;
	for (auto& crew : this->crewList) {
		if (crew->airline == filiale && crew->division == division) {
			results.emplace_back(crew);
		}
	}
	return results;
}

long long CrewDataContext::getRuleSetIdByLiveConfig(const string& filiale, const string& division, const string& module) const {
	long long ruleSetId = -1;
	for (auto& liveConfig : this->liveConfigList) {
		if (liveConfig->division == division && liveConfig->filiale == filiale && liveConfig->module == module) {
			if (ruleSetId == -1) {
				ruleSetId = liveConfig->ruleSetId;
			}
			else if (liveConfig->defaultRuleSetFlag) {
				ruleSetId = liveConfig->ruleSetId;
			}
		}
	}
	return ruleSetId;
}

vector<DBRule> CrewDataContext::getRuleListByLiveConfig(const string& filiale, const string& division, const string& module) const {
	vector<DBRule> dbRules;

	//获得法规集
	long long ruleSetId = getRuleSetIdByLiveConfig(filiale, division, module);
	if (ruleSetId < 0) {
		return dbRules;
	}

	//获得法规
	set<long long> ruleIds;
	std::for_each(this->ruleSetList.begin(), this->ruleSetList.end(), [ruleSetId, &ruleIds](const std::shared_ptr<RuleSet>& ruleSet) {
		if (ruleSet->worksetId == ruleSetId) {
			ruleIds.emplace(ruleSet->ruleId);
		}
		});

	for (auto& dbRule : this->allRuleList)
	{
		if (ruleIds.find(dbRule.idRule) == ruleIds.end()) {
			continue;
		}
		dbRules.emplace_back(dbRule);
	}
	return dbRules;
}

//合并roster列表
//要求输入列表 list1/ list2按 pair_id排序
//返回结果列表按 pair_id排序 
vector<SharedPtr<ROSTER>> mergeRosterListOrderByPairId(vector<SharedPtr<ROSTER>> &list1, vector<SharedPtr<ROSTER>> &list2) {
	vector<SharedPtr<ROSTER>> list;
	std::size_t p1 = 0, p2 = 0;
	std::size_t len = list1.size() + list2.size();
	while (p1 < list1.size() || p2 < list2.size()) {
		
		if (p1 < list1.size() && p2 < list2.size()) {
			SharedPtr<ROSTER> &r1 = list1[p1];
			SharedPtr<ROSTER> &r2 = list2[p2];
			if (r1->pairId <= r2->pairId) {
				list.push_back(r1);
				p1++;
			}
			else {
				list.push_back(r2);
				p2++;
			}
		}
		else if (p1 < list1.size()) {
			SharedPtr<ROSTER> &r1 = list1[p1];
			list.push_back(r1);
			p1++;
		}
		else if (p2 < list2.size()) {
			SharedPtr<ROSTER> &r2 = list2[p2];
			list.push_back(r2);
			p2++;
		}
	}
	return list;
}


void pairingBufToList(vector<Pairing*> &list, Pairing** buf, int count) {
	for (int i = 0; i < count; i++) {
		list.push_back(buf[i]);
	}
}


void updatePairingByEditor(Pairing* target, Pairing* input) {
	if (!target || !input)
		return;
	/* target->setBase(input->getBase())中input->getBase()为临时变量，且target->setBase（）形参为引用&
	 * c++编译器默认临时变量不可修改
	 * 如下两种修改方式：
	 * 1、需设置target->setBase（）中的形参为const
	 * 3、删除target->setBase（）形参中的&符号
	 * 2、新声明一个变量用来存储临时变量
	 * 2022/7/20 haoli.
	*/
	target->setBase(input->getBase());
	target->setPrimeActivity(input->getPrimeActivity());
	target->setAttribute(input->getAttribute());
	target->setTotalFatiguePoints(input->getTotalFatiguePoints());
	target->setFltCode(input->getFltCode());

	vector<int> BLK = input->getBlk();;
	target->setBLK(BLK[0], BLK[1]);

	vector<int> DP = input->getDP();
	target->setDP(DP[0], DP[1]);

	vector<int>FDP = input->getFDP();
	target->setFDP(FDP[0], FDP[1]);
	
	input->setComplements(input->getComplements());
	input->resetOpenComposition();
}

void removeCrewKpiAdjustByRoster(SharedPtr<CREW>& crew, const long long rosterId, RosterFlightMgr& rosterFlightMgr) {
	vector<shared_ptr<RosterFlight>> rfs = rosterFlightMgr.get(crew->idCrew);
	for (auto& rf : rfs) {
		if (rf->rosterId == rosterId) {
			long long rosterFlightId = rf->id;
			crew->crewKpiAdjustList.erase(std::remove_if(crew->crewKpiAdjustList.begin(), crew->crewKpiAdjustList.end(),
					[rosterFlightId](const auto& destCrewKpiAdjust) {return destCrewKpiAdjust->rosterFlightId == rosterFlightId; })
					, crew->crewKpiAdjustList.end());
		}
	}
}

//检查 rankDivision中是否包含指定division，用于简化后续代码
bool RankDivision::has(string division) {
	if (division == "P") return this->hasP;
	else if (division == "C") return this->hasC;
	else if (division == "A") return this->hasA;
	else return false;
}
//20210720 ain, mantis#9392, fdpDiscretion计算增加ruleParam.division过滤
//按 pairing配比中 rank.division计算 pairing所属 division=P|C|A，可多选
RankDivision CrewDataContext::getPairingRankDivision(long long pairingId) {
	RankDivision ret;
	map<string, int> comps = this->pairingIdMap[pairingId]->getComplements();
	map<string, int>::iterator compIter;
	for (compIter = comps.begin(); compIter != comps.end(); compIter++) {
		if (this->rankMap[compIter->first].division == "A") {
			ret.hasA = true;
		}
		else if (this->rankMap[compIter->first].division == "C") {
			ret.hasC = true;
		}
		else if (this->rankMap[compIter->first].division == "P") {
			ret.hasP = true;
		}
	}
	return ret;
}

void CrewDataContext::calcuateRulePhases(std::shared_ptr<CREW>& crew, const time_t currTimeUtc) {
	int mainBaseTimeZone = getMainBaseTimeZone();
	for (auto& roster : crew->rosterList) {

		//清除phases
		roster->clearPhases();
		if (roster->pairing != nullptr) {
			roster->pairing->clearPhases();
			for (auto& duty : roster->pairing->getDutyVec()) {
				duty->clearPhases();
				for (auto& segment : duty->getSegmentsRead()) {
					segment->clearPhases();
				}
			}
		}
		
		//重新设置phases
		for (auto& kv : rulePhaseConfigMap) {
			auto phaseId = kv.first;
			auto& rulePhaseConfig = kv.second;
			time_t lastPublishDateUtc = crew->lastPublishDate - (time_t)mainBaseTimeZone * 60;
			time_t startTimeUtc = rulePhaseConfig->getStartTimeUtc(currTimeUtc, lastPublishDateUtc, mainBaseTimeZone);
			time_t endTimeUtc = rulePhaseConfig->getEndTimeUtc(currTimeUtc, lastPublishDateUtc, mainBaseTimeZone);
			//Roster（包括休息时间）开始和结束时间和Phase重叠一分钟，视为对Roster启用该规则。
			if (roster->actStrUtc <= endTimeUtc && roster->actEndUtc >= startTimeUtc) {
				//rulePhaseConfig时间与roster时间重叠
				roster->appendPhase(phaseId);
				//Pairing、Duty和Segment的Phase与roster相同。
				// 由于同一个Pairing可以分配给不同Crew，因此每次Crew检查时需要重新计算phase
				if (roster->pairing != nullptr) {
					roster->pairing->appendPhase(phaseId);
					for (auto& duty : roster->pairing->getDutyVec()) {
						duty->appendPhase(phaseId);
						for (auto& segment : duty->getSegmentsRead()) {
							segment->appendPhase(phaseId);
						}
					}
				}
			}
		}
	}

	for (auto& manday : crew->mandayFdList) {
		calcuateRulePhases( manday.get(), crew, currTimeUtc, mainBaseTimeZone);
	}

	for (auto& manday : crew->mandayCcAmList) {
		calcuateRulePhases( manday.get(), crew, currTimeUtc, mainBaseTimeZone);
	}
}

void CrewDataContext::calcuateRulePhases(Pairing* pairing, const time_t currTimeUtc) {
	//清除phases
	pairing->clearPhases();
	for (auto& duty : pairing->getDutyVec()) {
		duty->clearPhases();
		for (auto& segment : duty->getSegmentsRead()) {
			segment->clearPhases();
		}
	}
	time_t maxLastPublishDate = -1;
	for (auto& crew : this->crewList) {
		if (maxLastPublishDate < crew->lastPublishDate) {
			maxLastPublishDate = crew->lastPublishDate;
		}
	}

	//重新设置phases
	int mainBaseTimeZone = getMainBaseTimeZone();
	for (auto& kv : rulePhaseConfigMap) {
		auto phaseId = kv.first;
		auto& rulePhaseConfig = kv.second;
		time_t startTimeUtc = rulePhaseConfig->getStartTimeUtc(currTimeUtc, maxLastPublishDate, mainBaseTimeZone);
		time_t endTimeUtc = rulePhaseConfig->getEndTimeUtc(currTimeUtc, maxLastPublishDate, mainBaseTimeZone);
		//Pairing开始和结束时间（包括休息时间），和Phase重叠一分钟，视为对Pairing启用该规则。
		if (pairing->getStartTimeUtcAct() <= endTimeUtc && pairing->getEndTimeIncludingRestUtcAct() >= startTimeUtc) {
			//rulePhaseConfig时间与roster时间重叠
			pairing->appendPhase(phaseId);
			//Duty和Segment的Phase与pairing相同
			//每次Pairing检查时需要重新计算phase
			for (auto& duty : pairing->getDutyVec()) {
				duty->appendPhase(phaseId);
				for (auto& segment : duty->getSegmentsRead()) {
					segment->appendPhase(phaseId);
				}
			}
		}
	}
}

void CrewDataContext::calcuateRulePhases(CREW_MANDAY_BASIC* manday, const std::shared_ptr<CREW>& crew, const time_t currTimeUtc, const int mainBaseTimeZone) {
	//清除phases
	manday->phase.clearPhases();

	//重新设置phases
	for (auto& kv : rulePhaseConfigMap) {
		auto phaseId = kv.first;
		auto& rulePhaseConfig = kv.second;
		time_t lastPublishDateUtc = crew->lastPublishDate - (time_t)mainBaseTimeZone * 60;
		time_t startTimeUtc = rulePhaseConfig->getStartTimeUtc(currTimeUtc, lastPublishDateUtc, mainBaseTimeZone);
		time_t endTimeUtc = rulePhaseConfig->getEndTimeUtc(currTimeUtc, lastPublishDateUtc, mainBaseTimeZone);

		if (manday->crewDateUtc <= endTimeUtc && manday->crewDateUtc >= startTimeUtc) {
			//rulePhaseConfig时间与manday时间重叠
			manday->phase.appendPhase(phaseId);
		}
	}
}

const set<long long>& PhaseSet::getPhases() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		return _phaseIds_instance;
	}
	return _phaseIds.get();
}

void PhaseSet::setPhases(const set<long long>& phaseIds) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		_phaseIds_instance = phaseIds;
	}
	else {
		_phaseIds.set(phaseIds);
	}
}

void PhaseSet::clearPhases() {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		_phaseIds_instance.clear();
	}
	else {
		_phaseIds.get().clear();
	}
}

void PhaseSet::appendPhase(const long long phaseId) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		_phaseIds_instance.insert(phaseId);
	}
	else {
		_phaseIds.get().insert(phaseId);
	}
}

void PhaseSet::removePhase(const long long phaseId) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		_phaseIds_instance.erase(phaseId);
	}
	else {
		_phaseIds.get().erase(phaseId);
	}
}

CREW_MANDAY_BASIC::CREW_MANDAY_BASIC() {}
CREW_MANDAY_BASIC::CREW_MANDAY_BASIC(string crewId, time_t utc) : idCrew(crewId), crewDateUtc(utc) {}

//检查是否统计值全部为0
bool CREW_MANDAY_BASIC::isEmpty() {
	if (blh == 0 && ft == 0 && fdp == 0 && dp == 0 && LEAVE == 0 && DAY_OFF == DAY_OFF_NA && isDomesticDo == DAY_OFF_NA && STANDBY == 0 && GND == 0 && PER_DIEM==0
		&& CSB == 0 && HSB == 0 && ASB == 0 && IS_AL == 0 && QUARANTINE==0)
		return true;
	else
		return false;
}


//清零
void CREW_MANDAY_BASIC::reset(const bool isAll) {
	//20180905 ain, mantis#3977, manday.reset补齐 HSB/CSB/ASB
	this->ft = 0;
	this->blh = 0;
	this->fdp = 0;
	this->dp = 0;
	this->cust_dp = 0;
	this->LEAVE = 0;
	this->leaveDuration = 0;
	this->DAY_OFF = DAY_OFF_NA;
	this->isDomesticDo = DAY_OFF_NA;
	this->isFirstRecy6Offsetddo = false;
	this->STANDBY = 0;
	this->standbyDuration = 0;
	this->GND = 0;
	this->groundDuration = 0;
	this->PER_DIEM = 0;
	this->LONG_PER_DIEM = 0;
	this->SCH_PER_DIEM = 0;
	this->SCH_LONG_PER_DIEM = 0;
	this->normal_wp = 0;
	this->extend_wp = 0;
	this->CSB = 0;
	this->ASB = 0;
	this->HSB = 0;
	this->IS_AL = 0;
	this->al = 0;
	this->QUARANTINE = 0;
	this->quarantineDuration = 0;
	this->custData1 = 0;
	this->custData2 = 0;
	this->HIGH_PLATEAU = 0;
	this->credit = 0;
	this->credit_pnc = 0;
	this->credit_sim = 0;
	this->credit_al = 0;
	this->credit_ol = 0;
	this->credit_freighter = 0;

	this->sch_credit = 0;
	this->sch_credit_pnc = 0;
	this->sch_credit_sim = 0;
	this->sch_credit_al = 0;
	this->sch_credit_ol = 0;
	this->sch_credit_freighter = 0;

	this->workingHour = 0;
	this->schWorkingHour = 0;

	this->SBY_DP = 0;
	this->DHD_DP = 0;
	this->layover_day = 0;
	this->IS_POSITION = false;
	this->operating_fleets.clear();
	this->operating_airports.clear();
	if (this->recalFleetLanding || isAll) {
		this->fleetTakeoff.clear();
		this->fleetLanding.clear();
		this->nightFleetTakeoff.clear();
		this->nightFleetLanding.clear();
	}

	this->attributes = "";
	this->augBlh = 0;
	this->intBlh = 0;
	this->fltNum = 0;
	this->radiationDose = 0.0;

	this->layoverTimes = 0;
	this->layoverDuration = 0;
	this->crossTzDutyCount = 0;
}
//从目标对象拷贝数据
void CREW_MANDAY_BASIC::copyFrom(CREW_MANDAY_BASIC * that) {
	if (!that)
		return;
	this->idCrew = that->idCrew;
	this->idScenario = that->idScenario;
	this->crewDateUtc = that->crewDateUtc;
	this->dateLoc = that->dateLoc;
	this->blh = that->blh;
	this->fdp = that->fdp;
	this->dp = that->dp;
	this->ft = that->ft;
	this->DAY_OFF = that->DAY_OFF;
	this->isDomesticDo = that->isDomesticDo;
	this->isFirstRecy6Offsetddo = that->isFirstRecy6Offsetddo;
	this->LEAVE = that->LEAVE;
	this->leaveDuration = that->leaveDuration;
	this->STANDBY = that->STANDBY;
	this->standbyDuration = that->standbyDuration;
	this->GND = that->GND;
	this->groundDuration = that->groundDuration;
	this->PER_DIEM = that->PER_DIEM;
	this->LONG_PER_DIEM = that->LONG_PER_DIEM;
	this->SCH_PER_DIEM = that->SCH_PER_DIEM;
	this->SCH_LONG_PER_DIEM = that->SCH_LONG_PER_DIEM;
	this->cust_dp = that->cust_dp;
	this->IS_POSITION = that->IS_POSITION;
	//wp
	this->normal_wp = that->normal_wp;
	this->extend_wp = that->extend_wp;

	//20180116 ain, OP#1583, CSB/HSB/ASB
	this->CSB = that->CSB;
	this->ASB = that->ASB;
	this->HSB = that->HSB;
	this->IS_AL = that->IS_AL;//20180426 ain, mantis#3223, 补齐 IS_AL
	this->al = that->al;
	this->QUARANTINE = that->QUARANTINE;
	this->quarantineDuration = that->quarantineDuration;
	this->custData1 = that->custData1;
	this->custData2 = that->custData2;
	this->HIGH_PLATEAU = that->HIGH_PLATEAU;
	this->credit = that->credit;
	this->credit_pnc = that->credit_pnc;
	this->credit_sim = that->credit_sim;
	this->credit_al = that->credit_al;
	this->credit_ol = that->credit_ol;
	this->credit_freighter = that->credit_freighter;
	this->sch_credit = that->sch_credit;
	this->sch_credit_pnc = that->sch_credit_pnc;
	this->sch_credit_sim = that->sch_credit_sim;
	this->sch_credit_al = that->sch_credit_al;
	this->sch_credit_ol = that->sch_credit_ol;
	this->sch_credit_freighter = that->sch_credit_freighter;
	this->workingHour = that->workingHour;
	this->schWorkingHour = that->schWorkingHour;
	this->SBY_DP = that->SBY_DP;
	this->DHD_DP = that->DHD_DP;
	this->layover_day = that->layover_day;

	this->operating_fleets.clear();
	this->operating_fleets.insert(that->operating_fleets.begin(), that->operating_fleets.end());
	this->operating_airports.clear();
	this->operating_airports.insert(that->operating_airports.begin(), that->operating_airports.end());
	this->recalFleetLanding = that->recalFleetLanding;

	if (this->recalFleetLanding) {
		this->fleetTakeoff.clear();
		this->fleetTakeoff.insert(that->fleetTakeoff.begin(), that->fleetTakeoff.end());
		this->fleetLanding.clear();
		this->fleetLanding.insert(that->fleetLanding.begin(), that->fleetLanding.end());
		this->nightFleetTakeoff.clear();
		this->nightFleetTakeoff.insert(that->nightFleetTakeoff.begin(), that->nightFleetTakeoff.end());
		this->nightFleetLanding.clear();
		this->nightFleetLanding.insert(that->nightFleetLanding.begin(), that->nightFleetLanding.end());
	}

	this->attributes = that->attributes;
	this->augBlh = that->augBlh;
	this->intBlh = that->intBlh;
	this->fltNum = that->fltNum;
	this->radiationDose = that->radiationDose;

	this->layoverTimes = that->layoverTimes;
	this->layoverDuration = that->layoverDuration;
	this->crossTzDutyCount = that->crossTzDutyCount;
}

void CREW_MANDAY_BASIC::addFrom(CREW_MANDAY_BASIC * that, bool isHalf) {
	this->blh += that->blh;
	this->fdp += that->fdp;
	this->dp += that->dp;
	this->ft += that->ft;
	if (this->DAY_OFF != DAY_OFF_EXIST && that->DAY_OFF != DAY_OFF_NA) {
		this->DAY_OFF = that->DAY_OFF;
	}
	if (this->isDomesticDo != DAY_OFF_EXIST && that->isDomesticDo != DAY_OFF_NA) {
		this->isDomesticDo = that->isDomesticDo;
	}
	this->isFirstRecy6Offsetddo = that->isFirstRecy6Offsetddo;
	this->LEAVE |= that->LEAVE;
	this->leaveDuration += that->leaveDuration;
	this->STANDBY |= that->STANDBY;
	this->standbyDuration += that->standbyDuration;
	this->GND |= that->GND;
	this->groundDuration += that->groundDuration;
	this->cust_dp += that->cust_dp;
	if (isHalf) {
		this->PER_DIEM = that->PER_DIEM;
		this->SCH_PER_DIEM = that->SCH_PER_DIEM;
	}
	else {
		this->PER_DIEM += that->PER_DIEM;
		this->SCH_PER_DIEM += that->SCH_PER_DIEM;
	}
	this->LONG_PER_DIEM += that->LONG_PER_DIEM;
	this->SCH_LONG_PER_DIEM += that->SCH_LONG_PER_DIEM;
	if (this->PER_DIEM > 1440)
	{
	//	Logger::getRuleLogger()->info("Exception, Perdiem>1440 in one day, check two half pair rosters , crew={}.", this->idCrew.c_str());
		if (this->PER_DIEM > 9999)
			this->PER_DIEM = 9999;
	}

	if (this->SCH_PER_DIEM > 1440)
	{
		//	Logger::getRuleLogger()->info("Exception, Perdiem>1440 in one day, check two half pair rosters , crew={}.", this->idCrew.c_str());
		if (this->SCH_PER_DIEM > 9999)
			this->SCH_PER_DIEM = 9999;
	}

	//20180116 ain, OP#1583, CSB/HSB/ASB
	this->CSB |= that->CSB;
	this->ASB |= that->ASB;
	this->HSB |= that->HSB;
	this->IS_AL |= that->IS_AL;//20180426 ain, mantis#3223, 补齐 IS_AL
	this->al += that->al;
	this->QUARANTINE |= that->QUARANTINE;
	this->quarantineDuration += that->quarantineDuration;

	this->custData1 += that->custData1;
	this->custData2 += that->custData2;

	//wp
	this->normal_wp += that->normal_wp;
	this->extend_wp += that->extend_wp;
	this->HIGH_PLATEAU += that->HIGH_PLATEAU;
	this->credit += that->credit;
	this->credit_pnc += that->credit_pnc;
	this->credit_sim += that->credit_sim;
	this->credit_al += that->credit_al;
	this->credit_ol += that->credit_ol;
	this->credit_freighter += that->credit_freighter;
	this->sch_credit += that->sch_credit;
	this->sch_credit_pnc += that->sch_credit_pnc;
	this->sch_credit_sim += that->sch_credit_sim;
	this->sch_credit_al += that->sch_credit_al;
	this->sch_credit_ol += that->sch_credit_ol;
	this->sch_credit_freighter += that->sch_credit_freighter;
	this->workingHour += that->workingHour;
	this->schWorkingHour += that->schWorkingHour;
	this->SBY_DP += that->SBY_DP;
	this->DHD_DP += that->DHD_DP;

	this->layover_day |= that->layover_day;

	this->addOperatingFleets(that->operating_fleets);
	this->addOperatingAirports(that->operating_airports);

	this->recalFleetLanding = that->recalFleetLanding;
	if (this->recalFleetLanding) {
		this->addFleetTakeoff(that->fleetTakeoff);
		this->addFleetLanding(that->fleetLanding);
		this->addNightFleetTakeoff(that->nightFleetTakeoff);
		this->addNightFleetLanding(that->nightFleetLanding);
	}

	if (this->attributes.empty())
		this->attributes += that->attributes;
	else
		this->attributes += "|" + that->attributes;

	this->augBlh += that->augBlh;
	this->intBlh += that->intBlh;
	this->fltNum += that->fltNum;
	this->radiationDose += that->radiationDose;

	this->layoverTimes += that->layoverTimes;
	this->layoverDuration += that->layoverDuration;
	this->crossTzDutyCount += that->crossTzDutyCount;
}

#define FIX_NEG_TO_ZERO(n) n = n < 0 ? 0 : n;
void CREW_MANDAY_BASIC::minusFrom(CREW_MANDAY_BASIC * that, bool isHalf) {
	this->blh -= that->blh; FIX_NEG_TO_ZERO(blh);
	this->fdp -= that->fdp; FIX_NEG_TO_ZERO(fdp);
	this->dp -= that->dp; FIX_NEG_TO_ZERO(dp);
	this->ft -= that->ft; FIX_NEG_TO_ZERO(ft);
	if (that->DAY_OFF == DAY_OFF_EXIST) this->DAY_OFF = DAY_OFF_NOT_EXIST;
	if (that->isDomesticDo == DAY_OFF_EXIST) {
		this->isDomesticDo = DAY_OFF_NOT_EXIST;
		this->isFirstRecy6Offsetddo = false;
	}
	this->LEAVE = this->LEAVE ? (that->LEAVE ? false : true) : false;
	this->leaveDuration -= that->leaveDuration; FIX_NEG_TO_ZERO(leaveDuration);
	this->STANDBY = this->STANDBY ? (that->STANDBY ? false : true) : false;
	this->standbyDuration -= that->standbyDuration; FIX_NEG_TO_ZERO(standbyDuration);
	this->GND = this->GND ? (that->GND ? false : true) : false;
	this->groundDuration -= that->groundDuration; FIX_NEG_TO_ZERO(groundDuration);
	this->cust_dp -= that->cust_dp; FIX_NEG_TO_ZERO(cust_dp);
	if (isHalf) {
		this->PER_DIEM = 0;
		this->SCH_PER_DIEM = 0;
	}
	else {
		this->PER_DIEM -= that->PER_DIEM; FIX_NEG_TO_ZERO(PER_DIEM);
		this->SCH_PER_DIEM -= that->SCH_PER_DIEM; FIX_NEG_TO_ZERO(SCH_PER_DIEM);
	}
	this->LONG_PER_DIEM -= that->LONG_PER_DIEM; FIX_NEG_TO_ZERO(LONG_PER_DIEM);
	this->SCH_LONG_PER_DIEM -= that->SCH_LONG_PER_DIEM; FIX_NEG_TO_ZERO(SCH_LONG_PER_DIEM);

	//20180116 ain, OP#1583, CSB/HSB/ASB
	this->CSB = this->CSB ? (that->CSB ? false : true) : false;
	this->ASB = this->ASB ? (that->ASB ? false : true) : false;
	this->HSB = this->HSB ? (that->HSB ? false : true) : false;
	this->IS_AL -= that->IS_AL; FIX_NEG_TO_ZERO(IS_AL); //20180426 ain, mantis#3223, 补齐 IS_AL
	this->al -= that->al; FIX_NEG_TO_ZERO(al);
	this->QUARANTINE -= that->QUARANTINE;FIX_NEG_TO_ZERO(QUARANTINE);
	this->quarantineDuration -= that->QUARANTINE; FIX_NEG_TO_ZERO(quarantineDuration);

	this->custData1 -= that->custData1; FIX_NEG_TO_ZERO(custData1);
	this->custData2 -= that->custData2; FIX_NEG_TO_ZERO(custData2);

	//wp
	this->normal_wp -= that->normal_wp; FIX_NEG_TO_ZERO(normal_wp);
	this->extend_wp -= that->extend_wp; FIX_NEG_TO_ZERO(extend_wp);
	this->credit -= that->credit; FIX_NEG_TO_ZERO(credit);
	this->credit_pnc -= that->credit_pnc; FIX_NEG_TO_ZERO(credit_pnc);
	this->credit_sim -= that->credit_sim; FIX_NEG_TO_ZERO(credit_sim);
	this->credit_al -= that->credit_al; FIX_NEG_TO_ZERO(credit_al);
	this->credit_ol -= that->credit_ol; FIX_NEG_TO_ZERO(credit_ol);
	this->credit_freighter -= that->credit_freighter; FIX_NEG_TO_ZERO(credit_freighter);
	this->sch_credit -= that->sch_credit; FIX_NEG_TO_ZERO(sch_credit);
	this->sch_credit_pnc -= that->sch_credit_pnc; FIX_NEG_TO_ZERO(sch_credit_pnc);
	this->sch_credit_sim -= that->sch_credit_sim; FIX_NEG_TO_ZERO(sch_credit_sim);
	this->sch_credit_al -= that->sch_credit_al; FIX_NEG_TO_ZERO(sch_credit_al);
	this->sch_credit_ol -= that->sch_credit_ol; FIX_NEG_TO_ZERO(sch_credit_ol);
	this->sch_credit_freighter -= that->sch_credit_freighter; FIX_NEG_TO_ZERO(sch_credit_freighter);
	this->workingHour -= that->workingHour;  FIX_NEG_TO_ZERO(workingHour);
	this->schWorkingHour -= that->schWorkingHour;  FIX_NEG_TO_ZERO(schWorkingHour);
	this->SBY_DP -= that->SBY_DP; FIX_NEG_TO_ZERO(SBY_DP);
	this->DHD_DP -= that->DHD_DP; FIX_NEG_TO_ZERO(DHD_DP);
	this->layover_day = this->layover_day ? (that->layover_day ? false : true) : false;

	this->minusOperatingFleets(that->operating_fleets);
	this->minusOperatingAirports(that->operating_airports);
	this->minusAttributes(that->attributes);
	this->augBlh -= that->augBlh;
	this->intBlh -= that->intBlh;
	this->fltNum -= that->fltNum;
	this->radiationDose -= that->radiationDose;

	this->recalFleetLanding = that->recalFleetLanding;
	if (this->recalFleetLanding) {
		this->minusFleetTakeoff(that->fleetTakeoff);
		this->minusFleetLanding(that->fleetLanding);
		this->minusNightFleetTakeoff(that->nightFleetTakeoff);
		this->minusNightFleetLanding(that->nightFleetLanding);
	}

	this->layoverTimes -= that->layoverTimes; FIX_NEG_TO_ZERO(layoverTimes);
	this->layoverDuration -= that->layoverDuration; FIX_NEG_TO_ZERO(layoverDuration);
	this->crossTzDutyCount -= that->crossTzDutyCount; FIX_NEG_TO_ZERO(crossTzDutyCount);
} 

void CREW_MANDAY_BASIC::addOperatingFleets(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		addOperatingFleets(otherPair);
	}
}

void CREW_MANDAY_BASIC::addOperatingFleets(const std::pair<string, int>& otherPair) {
	auto iter = this->operating_fleets.find(otherPair.first);
	if (iter != this->operating_fleets.end()) {
		iter->second += otherPair.second;
	}
	else {
		this->operating_fleets.insert(otherPair);
	}
}

void CREW_MANDAY_BASIC::minusOperatingFleets(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		minusOperatingFleets(otherPair);
	}
}

void CREW_MANDAY_BASIC::minusOperatingFleets(const std::pair<string, int>& otherPair) {
	auto iter = this->operating_fleets.find(otherPair.first);
	if (iter != this->operating_fleets.end()) {
		iter->second -= otherPair.second;
		if (iter->second <= 0) {
			this->operating_fleets.erase(otherPair.first);
		}
	}
}

void CREW_MANDAY_BASIC::addOperatingAirports(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		addOperatingAirports(otherPair);
	}
}

void CREW_MANDAY_BASIC::addOperatingAirports(const std::pair<string, int>& otherPair) {
	auto iter = this->operating_airports.find(otherPair.first);
	if (iter != this->operating_airports.end()) {
		iter->second += otherPair.second;
	}
	else {
		this->operating_airports.insert(otherPair);
	}
}

void CREW_MANDAY_BASIC::minusOperatingAirports(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		minusOperatingAirports(otherPair);
	}
}

void CREW_MANDAY_BASIC::minusAttributes(const std::string otherAttributes) {
	const auto& index = this->attributes.find(otherAttributes);
	if (index >= 0) {
		this->attributes.erase(index, otherAttributes.size());
	}
}

void CREW_MANDAY_BASIC::minusOperatingAirports(const std::pair<string, int>& otherPair) {
	auto iter = this->operating_airports.find(otherPair.first);
	if (iter != this->operating_airports.end()) {
		iter->second -= otherPair.second;
		if (iter->second <= 0) {
			this->operating_airports.erase(otherPair.first);
		}
	}
}

void CREW_MANDAY_BASIC::addFleetTakeoff(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		addFleetTakeoff(otherPair);
	}
}

void CREW_MANDAY_BASIC::addFleetTakeoff(const std::pair<string, int>& otherPair) {
	auto iter = this->fleetTakeoff.find(otherPair.first);
	if (iter != this->fleetTakeoff.end()) {
		iter->second += otherPair.second;
	}
	else {
		this->fleetTakeoff.insert(otherPair);
	}
}

void CREW_MANDAY_BASIC::minusFleetTakeoff(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		minusFleetTakeoff(otherPair);
	}
}

void CREW_MANDAY_BASIC::minusFleetTakeoff(const std::pair<string, int>& otherPair) {
	auto iter = this->fleetTakeoff.find(otherPair.first);
	if (iter != this->fleetTakeoff.end()) {
		iter->second -= otherPair.second;
		if (iter->second <= 0) {
			this->fleetTakeoff.erase(otherPair.first);
		}
	}
}

void CREW_MANDAY_BASIC::addFleetLanding(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		addFleetLanding(otherPair);
	}
}

void CREW_MANDAY_BASIC::addFleetLanding(const std::pair<string, int>& otherPair) {
	auto iter = this->fleetLanding.find(otherPair.first);
	if (iter != this->fleetLanding.end()) {
		iter->second += otherPair.second;
	}
	else {
		this->fleetLanding.insert(otherPair);
	}
}

void CREW_MANDAY_BASIC::minusFleetLanding(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		minusFleetLanding(otherPair);
	}
}

void CREW_MANDAY_BASIC::minusFleetLanding(const std::pair<string, int>& otherPair) {
	auto iter = this->fleetLanding.find(otherPair.first);
	if (iter != this->fleetLanding.end()) {
		iter->second -= otherPair.second;
		if (iter->second <= 0) {
			this->fleetLanding.erase(otherPair.first);
		}
	}
}

void CREW_MANDAY_BASIC::addNightFleetTakeoff(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		addNightFleetTakeoff(otherPair);
	}
}

void CREW_MANDAY_BASIC::addNightFleetTakeoff(const std::pair<string, int>& otherPair) {
	auto iter = this->nightFleetTakeoff.find(otherPair.first);
	if (iter != this->nightFleetTakeoff.end()) {
		iter->second += otherPair.second;
	}
	else {
		this->nightFleetTakeoff.insert(otherPair);
	}
}

void CREW_MANDAY_BASIC::minusNightFleetTakeoff(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		minusNightFleetTakeoff(otherPair);
	}
}

void CREW_MANDAY_BASIC::minusNightFleetTakeoff(const std::pair<string, int>& otherPair) {
	auto iter = this->nightFleetTakeoff.find(otherPair.first);
	if (iter != this->nightFleetTakeoff.end()) {
		iter->second -= otherPair.second;
		if (iter->second <= 0) {
			this->nightFleetTakeoff.erase(otherPair.first);
		}
	}
}

void CREW_MANDAY_BASIC::addNightFleetLanding(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		addNightFleetLanding(otherPair);
	}
}

void CREW_MANDAY_BASIC::addNightFleetLanding(const std::pair<string, int>& otherPair) {
	auto iter = this->nightFleetLanding.find(otherPair.first);
	if (iter != this->nightFleetLanding.end()) {
		iter->second += otherPair.second;
	}
	else {
		this->nightFleetLanding.insert(otherPair);
	}
}

void CREW_MANDAY_BASIC::minusNightFleetLanding(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		minusNightFleetLanding(otherPair);
	}
}

void CREW_MANDAY_BASIC::minusNightFleetLanding(const std::pair<string, int>& otherPair) {
	auto iter = this->nightFleetLanding.find(otherPair.first);
	if (iter != this->nightFleetLanding.end()) {
		iter->second -= otherPair.second;
		if (iter->second <= 0) {
			this->nightFleetLanding.erase(otherPair.first);
		}
	}
}

CREW_MANDAY_FD::CREW_MANDAY_FD() { division = fd; }

bool CREW_MANDAY_FD::isEmpty() {
	bool result = true;
	return result && CREW_MANDAY_BASIC::isEmpty();
}

void CREW_MANDAY_FD::reset(const bool isAll) {
	//this->augumentFt = 0;
	this->doubleFt = 0;
	//this->augumentBlh = 0;
	this->doubleBlh = 0;
	//this->nightDp = 0;
	//this->travel = 0;
	//this->credit = 0;
	//this->actTakeOffs = 0;
	//this->actLandings = 0;
	this->pubBlh = 0;
	this->pubAugBlh = 0;
	this->pubDobBlh = 0;
	this->pubFdp = 0;
	this->pubDp = 0;
	this->pubNightDp = 0;
	this->pubTravel = 0;
	this->pubCredit = 0;
	this->idUser = "";
	this->tmst = 0;
	//this->updowns = 0;
	//this->cat2Updowns = 0;
	//this->expBlh = 0;
	//this->takeoff = 0;
	//this->landing = 0;
	//this->fatigue = 0;

	CREW_MANDAY_BASIC::reset(isAll);
}

void CREW_MANDAY_FD::copyFrom(CREW_MANDAY_BASIC* that) {
	if (!that)	return;
	CREW_MANDAY_FD* thatFd = dynamic_cast<CREW_MANDAY_FD*>(that);
	if (thatFd != nullptr) {
		this->augumentFt = thatFd->augBlh;
		this->doubleFt = thatFd->doubleFt;
		this->augBlh = thatFd->augBlh;
		this->doubleBlh = thatFd->doubleBlh;
		this->nightDp = thatFd->nightDp;
		this->travel = thatFd->travel;
		//this->credit = thatFd->credit;
		this->actTakeOffs = thatFd->actTakeOffs;
		this->actLandings = thatFd->actLandings;
		this->pubBlh = thatFd->pubBlh;
		this->pubAugBlh = thatFd->pubAugBlh;
		this->pubDobBlh = thatFd->pubDobBlh;
		this->pubFdp = thatFd->pubFdp;
		this->pubDp = thatFd->pubDp;
		this->pubNightDp = thatFd->pubNightDp;
		this->pubTravel = thatFd->pubTravel;
		this->pubCredit = thatFd->pubCredit;
		this->idUser = thatFd->idUser;
		this->tmst = thatFd->tmst;
		this->updowns = thatFd->updowns;
		this->cat2Updowns = thatFd->cat2Updowns;
		this->expBlh = thatFd->expBlh;
		this->takeoff = thatFd->takeoff;
		this->landing = thatFd->landing;
		this->fatigue = thatFd->fatigue;
	}

	CREW_MANDAY_BASIC::copyFrom(that);
	this->augumentFt = that->augBlh;
	this->augBlh = that->augBlh;

}

void CREW_MANDAY_FD::addFrom(CREW_MANDAY_BASIC* that, bool isHalf) {
	if (!that)	return;
	//暂不处理
	CREW_MANDAY_BASIC::addFrom(that, isHalf);
}

void CREW_MANDAY_FD::minusFrom(CREW_MANDAY_BASIC* that, bool isHalf) {
	if (!that)	return;
	//暂不处理
	CREW_MANDAY_BASIC::minusFrom(that, isHalf);
}

CREW_MANDAY_CC_AM::CREW_MANDAY_CC_AM() { division = cc_am; }

bool CREW_MANDAY_CC_AM::isEmpty() {
	bool result = true;
	return result && CREW_MANDAY_BASIC::isEmpty();
}

void CREW_MANDAY_CC_AM::reset(const bool isAll) {
	//this->NIGHT_DP = 0;
	//this->TRAVEL = 0;
	//this->FATIGUE = 0;
	this->idUser = "";
	this->tmst = 0;
	CREW_MANDAY_BASIC::reset(isAll);
}

void CREW_MANDAY_CC_AM::copyFrom(CREW_MANDAY_BASIC* that) {
	if (!that)	return;
	CREW_MANDAY_CC_AM* thatCC = dynamic_cast<CREW_MANDAY_CC_AM*>(that);
	if (thatCC != nullptr) {
		this->NIGHT_DP = thatCC->NIGHT_DP;
		this->TRAVEL = thatCC->TRAVEL;
		this->FATIGUE = thatCC->FATIGUE;
		this->idUser = thatCC->idUser;
		this->tmst = thatCC->tmst;
	}
	CREW_MANDAY_BASIC::copyFrom(that);
}

void CREW_MANDAY_CC_AM::addFrom(CREW_MANDAY_BASIC* that, bool isHalf) {
	if (!that)	return;
	//暂不处理
	CREW_MANDAY_BASIC::addFrom(that, isHalf);
}

void CREW_MANDAY_CC_AM::minusFrom(CREW_MANDAY_BASIC* that, bool isHalf) {
	if (!that)	return;
	//暂不处理
	CREW_MANDAY_BASIC::minusFrom(that, isHalf);
}


CREW_QUALIFICATION::CREW_QUALIFICATION() {
	issuedUtc = renewedUtc = expiryUtc = cancelUtc = lastActivityUtc = earliestUtc = latestUtc = baseMonthStartUtc = baseMonthEndUtc = 0;
	isValid = false;
	basicMonth = basicMonth2 = 0;
}


static DATA_SOURCE_CONFIG g_data_source_config;
DATA_SOURCE_CONFIG& DATA_SOURCE_CONFIG::getInstance() {
	return g_data_source_config;
}

void mandayTimes::addOperatingFleets(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		addOperatingFleets(otherPair);
	}
}

void mandayTimes::addOperatingFleets(const std::pair<string, int>& otherPair) {
	auto iter = this->operating_fleets.find(otherPair.first);
	if (iter != this->operating_fleets.end()) {
		iter->second += otherPair.second;
	}
	else {
		this->operating_fleets.insert(otherPair);
	}
}

void mandayTimes::minusOperatingFleets(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		minusOperatingFleets(otherPair);
	}
}

void mandayTimes::minusOperatingFleets(const std::pair<string, int>& otherPair) {
	auto iter = this->operating_fleets.find(otherPair.first);
	if (iter != this->operating_fleets.end()) {
		iter->second -= otherPair.second;
		if (iter->second <= 0) {
			this->operating_fleets.erase(otherPair.first);
		}
	}
}

void mandayTimes::addOperatingDepAirports(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		addOperatingDepAirports(otherPair);
	}
}

void mandayTimes::addOperatingDepAirports(const std::pair<string, int>& otherPair) {
	auto iter = this->operating_dep_airports.find(otherPair.first);
	if (iter != this->operating_dep_airports.end()) {
		iter->second += otherPair.second;
	}
	else {
		this->operating_dep_airports.insert(otherPair);
	}
}

void mandayTimes::minusOperatingDepAirports(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		minusOperatingDepAirports(otherPair);
	}
}

void mandayTimes::minusOperatingDepAirports(const std::pair<string, int>& otherPair) {
	auto iter = this->operating_dep_airports.find(otherPair.first);
	if (iter != this->operating_dep_airports.end()) {
		iter->second -= otherPair.second;
		if (iter->second <= 0) {
			this->operating_dep_airports.erase(otherPair.first);
		}
	}
}

void mandayTimes::addOperatingArrAirports(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		addOperatingArrAirports(otherPair);
	}
}

void mandayTimes::addOperatingArrAirports(const std::pair<string, int>& otherPair) {
	auto iter = this->operating_arr_airports.find(otherPair.first);
	if (iter != this->operating_arr_airports.end()) {
		iter->second += otherPair.second;
	}
	else {
		this->operating_arr_airports.insert(otherPair);
	}
}

void mandayTimes::minusOperatingArrAirports(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		minusOperatingArrAirports(otherPair);
	}
}

void mandayTimes::minusOperatingArrAirports(const std::pair<string, int>& otherPair) {
	auto iter = this->operating_arr_airports.find(otherPair.first);
	if (iter != this->operating_arr_airports.end()) {
		iter->second -= otherPair.second;
		if (iter->second <= 0) {
			this->operating_arr_airports.erase(otherPair.first);
		}
	}
}

void mandayTimes::addFleetTakeoff(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		addFleetTakeoff(otherPair);
	}
}

void mandayTimes::addFleetTakeoff(const std::pair<string, int>& otherPair) {
	auto iter = this->fleetTakeoff.find(otherPair.first);
	if (iter != this->fleetTakeoff.end()) {
		iter->second += otherPair.second;
	}
	else {
		this->fleetTakeoff.insert(otherPair);
	}
}

void mandayTimes::minusFleetTakeoff(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		minusFleetTakeoff(otherPair);
	}
}

void mandayTimes::minusFleetTakeoff(const std::pair<string, int>& otherPair) {
	auto iter = this->fleetTakeoff.find(otherPair.first);
	if (iter != this->fleetTakeoff.end()) {
		iter->second -= otherPair.second;
		if (iter->second <= 0) {
			this->fleetTakeoff.erase(otherPair.first);
		}
	}
}

void mandayTimes::addFleetLanding(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		addFleetLanding(otherPair);
	}
}

void mandayTimes::addFleetLanding(const std::pair<string, int>& otherPair) {
	auto iter = this->fleetLanding.find(otherPair.first);
	if (iter != this->fleetLanding.end()) {
		iter->second += otherPair.second;
	}
	else {
		this->fleetLanding.insert(otherPair);
	}
}

void mandayTimes::minusFleetLanding(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		minusFleetLanding(otherPair);
	}
}

void mandayTimes::minusFleetLanding(const std::pair<string, int>& otherPair) {
	auto iter = this->fleetLanding.find(otherPair.first);
	if (iter != this->fleetLanding.end()) {
		iter->second -= otherPair.second;
		if (iter->second <= 0) {
			this->fleetLanding.erase(otherPair.first);
		}
	}
}

void mandayTimes::addNightFleetTakeoff(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		addNightFleetTakeoff(otherPair);
	}
}

void mandayTimes::addNightFleetTakeoff(const std::pair<string, int>& otherPair) {
	auto iter = this->nightFleetTakeoff.find(otherPair.first);
	if (iter != this->nightFleetTakeoff.end()) {
		iter->second += otherPair.second;
	}
	else {
		this->nightFleetTakeoff.insert(otherPair);
	}
}

void mandayTimes::minusNightFleetTakeoff(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		minusNightFleetTakeoff(otherPair);
	}
}

void mandayTimes::minusNightFleetTakeoff(const std::pair<string, int>& otherPair) {
	auto iter = this->nightFleetTakeoff.find(otherPair.first);
	if (iter != this->nightFleetTakeoff.end()) {
		iter->second -= otherPair.second;
		if (iter->second <= 0) {
			this->nightFleetTakeoff.erase(otherPair.first);
		}
	}
}

void mandayTimes::addNightFleetLanding(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		addNightFleetLanding(otherPair);
	}
}

void mandayTimes::addNightFleetLanding(const std::pair<string, int>& otherPair) {
	auto iter = this->nightFleetLanding.find(otherPair.first);
	if (iter != this->nightFleetLanding.end()) {
		iter->second += otherPair.second;
	}
	else {
		this->nightFleetLanding.insert(otherPair);
	}
}

void mandayTimes::minusNightFleetLanding(const std::map<string, int>& other) {
	for (auto& otherPair : other) {
		minusNightFleetLanding(otherPair);
	}
}

void mandayTimes::minusNightFleetLanding(const std::pair<string, int>& otherPair) {
	auto iter = this->nightFleetLanding.find(otherPair.first);
	if (iter != this->nightFleetLanding.end()) {
		iter->second -= otherPair.second;
		if (iter->second <= 0) {
			this->nightFleetLanding.erase(otherPair.first);
		}
	}
}

//返回值：map<本地时间天,当天所有MandayActivity列表>
map<time_t, vector<SharedPtr<MandayActivity>>> MandayActivity::getCrewMandayActivityGroupByDay(const vector<SharedPtr<MandayActivity>>& crewMandayActivities, const SharedPtr<CrewDataContext>& dbData, const int offsetTZMinutes, const string timeType) {
	map<time_t, vector<SharedPtr<MandayActivity>>> mResults;


	time_t localStartDay, localEndDay;
	time_t currentDay;
	int iDaysBetween;
	for (auto& mandayActivity : crewMandayActivities)
	{
		//string timeType = mandayActivity->getTimeType();
		//if (!defaultTimeType.empty()) {
		//	mandayActivity->setTimeType(defaultTimeType);
		//	timeType = defaultTimeType;
		//}

		//开始日期(UTC时间)
		localStartDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(mandayActivity->getStartTimeUtc(timeType), offsetTZMinutes);
		localEndDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(mandayActivity->getEndTimeUtc(timeType), offsetTZMinutes);

		string splitMethod = mandayActivity->getSplitMethod();
		if (splitMethod == "START") {//仅记录到开始日期
			SharedPtr<MandayActivity> temp = std::make_shared<MandayActivity>(*mandayActivity);
			time_t startTimeUtc = mandayActivity->getStartTimeUtc(timeType);
			time_t endTimeUtc = mandayActivity->getEndTimeUtc(timeType);

			temp->setCalcStartTimeUtc(startTimeUtc, timeType);
			temp->setCalcEndTimeUtc(endTimeUtc, timeType);
			temp->setCalcStartTimeLoc(startTimeUtc + (time_t)offsetTZMinutes * 60, timeType);
			temp->setCalcEndTimeLoc(endTimeUtc + (time_t)offsetTZMinutes * 60, timeType);

			double duration = temp->getCalcDuration(timeType) < 0 ? (double)(endTimeUtc - startTimeUtc) : temp->getCalcDuration(timeType);
			temp->setCalcDuration(duration, timeType);

			time_t currentDayLoc = localStartDay + (time_t)offsetTZMinutes * 60;
			auto iter = mResults.find(currentDayLoc);
			if (iter == mResults.end()) {
				vector<SharedPtr<MandayActivity>> mandayActivities;
				mandayActivities.emplace_back(temp);
				mResults.insert(std::make_pair(currentDayLoc, mandayActivities));
			}
			else {
				iter->second.emplace_back(temp);
			}
			continue;
		}

		// 增加保护，只计算一年内的manday
		iDaysBetween = min((int)((localEndDay - localStartDay) / (24 * 3600) + 1), 365);
		int iPhTaken = 0;
		for (int i = 0; i < iDaysBetween; ++i)
		{
			currentDay = localStartDay + (time_t)i * 24 * 3600;

			time_t currentDayStart = max(currentDay, mandayActivity->getStartTimeUtc(timeType));
			time_t currentDayEnd = min(currentDay + (time_t)24 * 3600, mandayActivity->getEndTimeUtc(timeType));

			if (currentDayEnd > currentDayStart) {
				SharedPtr<MandayActivity> temp = std::make_shared<MandayActivity>(*mandayActivity);
				temp->setCalcStartTimeUtc(currentDayStart, timeType);
				temp->setCalcEndTimeUtc(currentDayEnd, timeType);
				temp->setCalcStartTimeLoc(currentDayStart + (time_t)offsetTZMinutes * 60, timeType);
				temp->setCalcEndTimeLoc(currentDayEnd + (time_t)offsetTZMinutes * 60, timeType);
				

				if (splitMethod == "AVG") {
					double duration = temp->getCalcDuration(timeType) < 0 ? (double)(mandayActivity->getEndTimeUtc(timeType) - mandayActivity->getStartTimeUtc(timeType)) : temp->getCalcDuration(timeType);
					temp->setCalcDuration(duration/ iDaysBetween, timeType);
				}
				else {
					temp->setCalcDuration(mandayActivity->getCalcDuration(timeType), timeType);
				}

				time_t currentDayLoc = currentDay + (time_t)offsetTZMinutes * 60;
				auto iter = mResults.find(currentDayLoc);
				if (iter == mResults.end()) {
					vector<SharedPtr<MandayActivity>> mandayActivities;
					mandayActivities.emplace_back(temp);
					mResults.insert(std::make_pair(currentDayLoc, mandayActivities));
				}
				else {
					iter->second.emplace_back(temp);
				}
			}
		}
	}
	return mResults;
}

map<time_t, double> MandayActivity::merge(const map<time_t, vector<SharedPtr<MandayActivity>>>& crewMandayActivitiesMap, const string timeType) {
	map<time_t, double> mResults;
	for (auto& pair : crewMandayActivitiesMap) {
		//累计每日的Credit/Per Diem等
		double sum = 0;
		for (auto& activity : pair.second) {
			double value = static_cast<double>(activity->getCalcEndTimeUtc(timeType) - activity->getCalcStartTimeUtc(timeType));
			if (activity->getPercent() >= 0) {
				value *= activity->getPercent();
			}
			if (activity->getMultiple() >= 0) {
				value *= activity->getMultiple();
			}

			sum += value;
		}
		mResults.insert(std::make_pair(pair.first, sum));
	}
	return mResults;
}

map<time_t, double> MandayActivity::getCrewMandayGroupByDay(const vector<SharedPtr<MandayActivity>>& crewMandayActivities, const SharedPtr<CrewDataContext>& dbData, const int offsetTZMinutes, const string timeType) {
	auto crewMandayActivitiesMap = MandayActivity::getCrewMandayActivityGroupByDay(crewMandayActivities, dbData, offsetTZMinutes, timeType);
	return merge(crewMandayActivitiesMap, timeType);
}

/*
* 获得法规检查阶段时间
* @return -1：表示时间不受限值（开始时间最小时间，结束时间最大时间），0：表示忽略检查，其他值正常时间
*/
inline time_t GetRulePhaseTime(const time_t nowUtc, const time_t lastPublishDateUtc, const int offsetTZMinutes, 
	const string& dtType, const string& dtRange, const int dtRangeDays, const string& dtRangeUnit, const string& dtRangeType) {

	//dtType取值 1 = today, 2 = publish day, 3 = other
	time_t phaseTime = -1;
	if (dtType == "1") { // 1 = today
		phaseTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(nowUtc, offsetTZMinutes);
	}
    else if (dtType == "2") { //2 = publish day
		phaseTime = lastPublishDateUtc < 0 ? 0 : Utility::GetInstancePtr()->getLocalDayStartInUTC(lastPublishDateUtc, offsetTZMinutes);
	}
	else if (dtType == "3") { //3 = other
		//dtRangeType 取值 1=today, 2=publish day
		if (dtRangeType == "1") { // 1=today(默认值)
			if (dtRangeUnit == "1") { //单位：天
				phaseTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(nowUtc, offsetTZMinutes);
			}
			else if (dtRangeUnit == "2") { //单位：小时
				phaseTime = Utility::GetInstancePtr()->getLocalHourStartInUTC(nowUtc, offsetTZMinutes);
			}
			else {
				phaseTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(nowUtc, offsetTZMinutes);// 默认单位：天
			}
		}
		else if (dtRangeType == "2") { //2=publish day
			if (dtRangeUnit == "1") { //单位：天
				phaseTime = lastPublishDateUtc < 0 ? 0 : Utility::GetInstancePtr()->getLocalDayStartInUTC(lastPublishDateUtc, offsetTZMinutes);
			}
			else if (dtRangeUnit == "2") { //单位：小时
				phaseTime = lastPublishDateUtc < 0 ? 0 : Utility::GetInstancePtr()->getLocalHourStartInUTC(lastPublishDateUtc, offsetTZMinutes);
			}
			else {
				phaseTime = lastPublishDateUtc < 0 ? 0 : Utility::GetInstancePtr()->getLocalDayStartInUTC(lastPublishDateUtc, offsetTZMinutes);// 默认单位：天
			}
		}

		if (phaseTime > 0) {
			//dtRange 范围方向：1=Next(未来时间)(默认值), 2=Past(过去时间)
			int gap = dtRangeDays; //dtRange 1=Next(未来时间)(默认值)
			if (dtRange == "1") { //1=Next(默认值)
				//gapDays = dtRangeDays;
			}
			else if (dtRange == "2") { //2=Past
				gap = -1 * dtRangeDays;
 			}
			if (dtRangeUnit == "1") {
				phaseTime = phaseTime + (time_t)gap * 24 * 3600;
			}
			else if (dtRangeUnit == "2") { //单位：小时
				phaseTime = phaseTime + (time_t)gap * 3600;
			}
			else {
				//默认单位：天
				phaseTime = phaseTime + (time_t)gap * 24 * 3600;
			}
		}
	}

	return phaseTime;
}

time_t RulePhaseConfig::getStartTimeUtc(const time_t nowUtc, const time_t lastPublishDateUtc, const int offsetTZMinutes) const {
	//lastPublishDate 本地时区
	time_t startTimeUtc = GetRulePhaseTime(nowUtc, lastPublishDateUtc, offsetTZMinutes, this->strDtType, this->strDtRange, this->strDtRangeDays, this->strDtRangeUnit, this->strDtRangeType);
	if (startTimeUtc == 0) {
		return LLONG_MAX;
	}
	return startTimeUtc < 0 ? LLONG_MIN : startTimeUtc;
}

time_t RulePhaseConfig::getEndTimeUtc(const time_t nowUtc, const time_t lastPublishDateUtc, const int offsetTZMinutes) const {
    time_t endTimeUtc = GetRulePhaseTime(nowUtc, lastPublishDateUtc, offsetTZMinutes, this->endDtType, this->endDtRange, this->endDtRangeDays, this->endDtRangeUnit, this->endDtRangeType);
	if (endTimeUtc == 0) {
		return LLONG_MIN;
	}
    return endTimeUtc < 0 ? LLONG_MAX : (endTimeUtc + 24 * 3600 - 1); //23:59:59 of the end day
}
