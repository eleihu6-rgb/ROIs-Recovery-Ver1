#include <algorithm>
#include <time.h>
#include "CsvStreamUtil.h"
#include "UtilFunc.h"
#include "StringUtil.h"
#include "CrewDBUtil.h"
#include "PairingUtil.h"
#include "AssignmentHolder.h"
#include "Utility.h"
#include "csv_impl.h"
#include "PersistentDataSingleton.h"
#include "Log/Logger.h"
#include "DataCheck.h"
#include "DataError.h"
#include "CrewDataValidation.h"
#include <fstream> 

#include "TimezoneUtils.h"
using namespace std;

static void populateNonOperatingFlightServiceType(const unordered_map<long long, SharedPtr<Segment>>& flightIdMap,
	vector<Segment*>& segments);

void loadWorksetAndScenario(CrewDataContext* dbData, crewCsvReader& reader, map<long long, BASE>& baseObjMap, map<long long, RANK>& rankObjMap, map<long long, string>& fleetIdMap, map<long long, ATTRIBUTE*>& tmpAttrMap, map<long long, SharedPtr<TAG_CATEGORY>> tmpTagMap) {
	size_t i = 0;
	vector<void*> scenarioList = reader.datas["Scenario"];
	if (scenarioList.empty()) {
		Logger::getRuleLogger()->error("[loadWorksetAndScenario] invalid data, no scenario");
		return;
	}
	dbData->scenario = *(Scenario*)scenarioList[0];
	Scenario& scenario = dbData->scenario;
	for (i = 0; i < dbData->scenario.rankIds.size(); i++) {
		scenario.rankList.push_back(rankObjMap[scenario.rankIds[i]]);
		scenario.ranks.push_back(rankObjMap[scenario.rankIds[i]].rank);
	}
	if (!dbData->scenario.rankCross.empty()) {//优先读取用户指定downrank，目前只支持多对一。竖线分割，竖线前面是降级前的级别active ranks，竖线后面是降级后的级别acting rank
		vector<string> tmpRanksStr;
		split(dbData->scenario.rankCross, '|', tmpRanksStr);
		dbData->scenario.actingRanks.push_back(tmpRanksStr[1]); //目前只支持多对一，所以直接读取
	}
	//if (dbData->scenario.actingRanks.empty()) {
		for (i = 0; i < dbData->scenario.actingRankIds.size(); i++) {
			scenario.actingRanks.push_back(rankObjMap[scenario.actingRankIds[i]].rank);
		}
	//}
	//if (dbData->scenario.actingRanks.empty()) {
		for (i = 0; i < dbData->scenario.rankIds.size(); i++) {
			scenario.actingRankIds.push_back(scenario.rankIds[i]);
			scenario.actingRanks.push_back(rankObjMap[scenario.rankIds[i]].rank);
		}
	//}
	
	//version 2 paId存储的是pairing attributes; 而version 3改为统一用Tag，但值还是存储在paId中（为了和2.0代码兼容）
	if (dbData->version == 2){
		if (dbData->scenario.paList != "") {
			vector<string> paIdList;
			split(scenario.paList, ',', paIdList);
			for (string idStr : paIdList) {
				long long id = atoll(idStr.c_str());
				if (tmpAttrMap.find(id) != tmpAttrMap.end())
					scenario.pairingAttributes.push_back(tmpAttrMap[id]->code);
			}
		}
	}
	else {
        if (dbData->scenario.tagIds != "") {
            vector<string> tagIdList;
            split(scenario.tagIds, ',', tagIdList);
            for (string idStr : tagIdList) {
                long long id = atoll(idStr.c_str());
                if (tmpTagMap.find(id) != tmpTagMap.end())
                    scenario.pairingTags.push_back(tmpTagMap[id]->code);
            }
        }
        scenario.pairingAttributes = scenario.pairingTags;
	}

	//idList -> nameList
	for (i = 0; i < dbData->scenario.baseIds.size(); i++) {
		scenario.bases.push_back(baseObjMap[scenario.baseIds[i]].base);
	}
	for (i = 0; i < dbData->scenario.crewBaseIds.size(); i++) {
		scenario.crewBases.push_back(baseObjMap[scenario.crewBaseIds[i]].base);
	}
	for (i = 0; i < dbData->scenario.fleetIds.size(); i++) {
		scenario.fleets.push_back(fleetIdMap[scenario.fleetIds[i]]);
	}
	//scenario.assignGrp names
	vector<long long> assignGrpIdList;
	split(dbData->scenario.assignmentGroupId.c_str(), ',', assignGrpIdList);
	for (long long groupId : assignGrpIdList) {
		for (i = 0; i < dbData->totalAssignGrps.size(); i++) {
			ASSIGNMENT_GROUP* obj = &dbData->totalAssignGrps[i];
			if (obj->assignGrpId == groupId
				&& std::find(scenario.assignGrps.begin(), scenario.assignGrps.end(), obj->assignGrp) == scenario.assignGrps.end())
				scenario.assignGrps.push_back(obj->assignGrp);
		}
	}

	//20200511 ain, mantis#8284, scen.utc时区计算按默认基地, systemParameter[CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE]
	//时区修正
	string defaultAirport = dbData->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"];
	if (defaultAirport != "") {
		int timezoneOffsetMinutes = dbData->getAirportOffsetMinutes(defaultAirport);
		time_t startLoc = utcToLocal(scenario.startDtUTC);
		time_t endLoc = utcToLocal(scenario.endDtUTC);
		scenario.startDtUTC = startLoc - (time_t)(timezoneOffsetMinutes * 60);
		scenario.endDtUTC = endLoc - (time_t)(timezoneOffsetMinutes * 60);
	}
	dbData->scenarioId = dbData->scenario.scenarioId;
	dbData->startUtc = dbData->scenario.startDtUTC;
	dbData->endUtc = dbData->scenario.endDtUTC + 24 * 3600 - 1;//LCOAL 23:59 in UTC

	//Workset
	vector<void*> wkList = reader.datas["Workset"];
	if (wkList.size() > 0) {
		csvWorkset tmpWorkset = *(csvWorkset*)wkList[0];
		dbData->scenario.division = tmpWorkset.division;
		dbData->scenario.category = tmpWorkset.category;
		if (tmpWorkset.filiale != "") {
			dbData->scenario.airline = tmpWorkset.filiale;
		}
		
	}
	//20190829 ain, mantis#6565
	AssignmentHolder::getAirline(dbData->scenario.airline);
}

void loadFlightAndCompAndAttr(unordered_map<long long, SharedPtr<Segment>>& flightIdMap, vector<std::shared_ptr<Segment>>& flightList, crewCsvReader& reader, CrewDataContext* dbData) {
	size_t i = 0;
	int flightIndex = 0;
	bool isPoScenario = (dbData->scenarioId > 0 && dbData->scenario.category == "PO");
	const string& worksetDivision = dbData->scenario.division;
	const string& worksetFiliale = dbData->scenario.airline;

	//flight
	vector<void*>& csvFlightList = reader.datas["Flight"];
	//vector<SharedPtr<Segment>> flightList;
	for (i = 0; i < csvFlightList.size(); i++) {
		auto seg = std::make_shared<Segment>((Segment*)csvFlightList[i]);
		
		//PO优化：根据WorkSet的division和filiale过滤航班
		bool shouldLoadFlight = true;
		if (isPoScenario && !worksetDivision.empty() && !worksetFiliale.empty()) {
			if (worksetDivision == "P") {
				//飞行员部门：检查pilotOwner
				string pilotOwner = seg->getPilotOwner();
				if (pilotOwner.empty() || pilotOwner != worksetFiliale) {
					shouldLoadFlight = false;
				}
			} else if (worksetDivision == "C") {
				//乘务员部门：检查cabinOwner
				string cabinOwner = seg->getCabinOwner();
				if (cabinOwner.empty() || cabinOwner != worksetFiliale) {
					shouldLoadFlight = false;
				}
			} else if (worksetDivision == "A") {
				//安保员部门：检查airmarshalOwner
				string airmarshalOwner = seg->getAirmarshalOwner();
				if (airmarshalOwner.empty() || airmarshalOwner != worksetFiliale) {
					shouldLoadFlight = false;
				}
			}
		}
		
		if (!shouldLoadFlight) {
			continue; //跳过不符合条件的航班
		}
		
		flightList.push_back(seg);
		flightIdMap[seg->getDBId()] = seg;
		seg->resetOpenComposition();
		seg->setId(flightIndex++);
	}
	//提前释放flight
	ClearCsvReaderData(Segment, csvFlightList);

	//flight composition -> flight
	vector<void*> csvFlightCompositionList = reader.datas["FlightComposition"];
	for (i = 0; i < csvFlightCompositionList.size(); i++) {
		csvActivityComposition* fc = (csvActivityComposition*)csvFlightCompositionList[i];
		dbData->originalFlightComposition.emplace_back(*fc); // deep copy, memory on heap will be removed after reader get cleared
		//20190328 ZZM, flight_comp允许division不同部分
		//if (fc->division != dbData->scenario.division.at(0)) {
		//	continue;//201811114 ain, flight_comp忽略division不同部分
		//}
		if (flightIdMap.find(fc->activityId) == flightIdMap.end()) {
			Logger::getRuleLogger()->info("invalid data, flight {} not found for flight-composition", fc->activityId);
			continue;
		}
		auto flt = flightIdMap[fc->activityId];
		if (dbData->version == 3) {
			flt->addPlanComposition(fc->actingRank, fc->planValue);
		}
		else {
			composition_rank& rankValue = dbData->compositionRankMap[fc->compId];
			for (int i = 0; i < rankValue.rankCount; i++) {
				rank_value& cr = rankValue.rankValue[i];
				string rank = cr.rank;
				string division = "";
				division.push_back(fc->division);
				int value = cr.plan_value;
				flt->addPlanComposition(rank, value * fc->multipler);
				//bug: generateDuty need seg.compID
				flt->setCompositionId(fc->compId);
				flt->addDivisionCompositionId(division, fc->compId); //mantis5232 支持同一个航班多个division为 cc 或 am下的配比计算
			}
		}
		
	}
	//若FlightComposition为空则尝试解析 FlightRankValue 
	if (csvFlightCompositionList.size() == 0)
	{
		vector<void*> csvRankValueList = reader.datas["FlightRankValue"];
		for (size_t i = 0; i < csvRankValueList.size(); i++) {
			csvRankValue * item = (csvRankValue*)csvRankValueList[i];
			auto flt = flightIdMap[item->activityId];
			flt->addPlanComposition(item->rank, item->value);
		}
	}

	if (dbData->attributeIdMap.empty()) {
		Logger::getRuleLogger()->info("warning, no attribute definition found before parse Flight_Attribute\n");
	}

	//flight attribute -> flight
	vector<void*> csvFlightAttributeList = reader.datas["FlightAttribute"];
	for (i = 0; i < csvFlightAttributeList.size(); i++) {
		csvFlightAttribute* fa = (csvFlightAttribute*)csvFlightAttributeList[i];
		if (flightIdMap.find(fa->fltId) == flightIdMap.end()) {
			Logger::getRuleLogger()->info("invalid data, flight {} not found for flight-attribute", fa->fltId);
			continue;
		}
		auto flt = flightIdMap[fa->fltId];
		//20180419 ain, flt.attrs改为 map实现, 不再使用 FlightAttribute对象
		if (flt) {
			if (dbData->attributeIdMap.find(fa->attrId) != dbData->attributeIdMap.end()) {
				flt->addAttribute(dbData->attributeIdMap[fa->attrId].code);
			}
		}
	}

	////historyBlh -> flihgt
	//map<string, int> fltBlhHistoryKeyMap;
	//stringstream key;
	//vector<void*> csvFltBlhHistoryList = reader.datas["FlightBlhHistory"];
	//for (i = 0; i < csvFltBlhHistoryList.size(); i++) {
	//	csvFlightBlhHistory* obj = (csvFlightBlhHistory*)csvFltBlhHistoryList[i];
	//	key.str("");//clear
	//	key << obj->depArp << ":" << obj->arvArp << ":" << obj->fleet;
	//	fltBlhHistoryKeyMap[key.str()] = obj->blkMin;
	//}
	//for (auto& flt : flightList) {
	//	key.str("");//clear
	//	key << flt->getDepSta() << ":" << flt->getArrSta() << ":" << flt->getFleetCD();
	//	if (fltBlhHistoryKeyMap.find(key.str()) == fltBlhHistoryKeyMap.end()) {
	//		flt->setBlkMinHistory(0);
	//	}
	//	else {
	//		flt->setBlkMinHistory(fltBlhHistoryKeyMap[key.str()]);
	//	}
	//}


	//20180508 ain, mantis#3310, 补齐赋值 flt._depMinuteFromDayBegin/setArrMinutesFromDayBegin/date/dayInt
	for (auto& flt : flightList) {
		if (dbData->version == 3) {
			fillSegmentLocTimeField(flt.get(), dbData->airportCodeMap, dbData);
		}
		fillSegmentDateField(flt.get());

		time_t flightStartUtc = flt->getStartTimeUtcAct();
		const auto& startUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(flightStartUtc, 0);
		if (dbData->flightDateMap.find(startUtc) == dbData->flightDateMap.end()) {
			vector<std::shared_ptr<Segment>> segments;
			dbData->flightDateMap[startUtc] = segments;
		}
		dbData->flightDateMap[startUtc].push_back(flt);

	}
}

//读取csv pairing/duty/seg段, 输出 pairingIdMap
void loadPairingDutySegment(unordered_map<long long, Pairing*>& pairingIdMap, unordered_map<long long, SharedPtr<Segment>>& flightIdMap, map<long long, shared_ptr<map<string, int>>>& compositionRankValueMap, crewCsvReader& reader, CrewDataContext* dbData) {
	DataCheck dataChecker;
	size_t i = 0;
	//pairing/duty/segment
	vector<void*>& csvPairingList = reader.datas["Pairing"];
	
	//RO优化：根据WorkSet的division和filiale过滤Pairing数据
	bool isRoScenario = (dbData->scenarioId > 0 && dbData->scenario.category == "RO");
	const string& worksetDivision = dbData->scenario.division;
	const string& worksetFiliale = dbData->scenario.airline;

	for (i = 0; i < csvPairingList.size(); i++) {
		Pairing * copy = new Pairing(*(Pairing*)csvPairingList[i]);
		if (pairingIdMap.find(copy->getDbId()) != pairingIdMap.end()) {
			cout << "ERROR: duplicate pairing " << copy->getDbId() << endl;
			continue;
		}
		
		//RO场景下过滤Pairing数据
		if (isRoScenario && !worksetDivision.empty() && !worksetFiliale.empty()) {
			//如果Pairing.Division != workset.division，并且Pairing.filiale != workset.filiale，过滤该Pairing数据
			if (copy->getDivision() != worksetDivision || copy->getFiliale() != worksetFiliale) {
				delete copy; //释放内存
				continue; //跳过不符合条件的Pairing
			}
		}
		
		//从不同部门读取rankComb，转入rankCombCriteriaId
		if (dbData->getApplicationType() == "OR" && (dbData->scenario.category == "RO" || dbData->scenario.category == "TO")) {
			if (dbData->scenario.division == "P")
				copy->setRankCombCriteriaId(copy->getRankCombCP());
			else if (dbData->scenario.division == "C")
				copy->setRankCombCriteriaId(copy->getRankCombCC());
			else
				copy->setRankCombCriteriaId(copy->getRankCombCA());
		}
		
		pairingIdMap[copy->getDbId()] = copy;
	}
	vector<void*>& csvDutyList = reader.datas["PairingDuty"];
	unordered_map<long long, Duty*> dutyIdMap;
	vector<Duty*> dutyList;
	for (i = 0; i < csvDutyList.size(); i++) {
		Duty * csvItem = (Duty*)csvDutyList[i];
		Duty * copy = new Duty(*(Duty*)csvDutyList[i]);
		if (copy == NULL) {
			cout << "duty is null " << endl;
		}
		dutyIdMap[copy->getDutyId()] = copy;
		dutyList.push_back(copy);
	}
	const auto & ferryFltIdMap = dbData->ferryFltIdMap;
	vector<void*>& csvSegmentList = reader.datas["PairingSegment"];
	vector<Segment*> segmentList;
	for (i = 0; i < csvSegmentList.size(); i++) {
		Segment * csvItem = (Segment*)csvSegmentList[i];
		Segment * copy = new Segment(*(Segment*)csvSegmentList[i]);
		//20180503 ain, mantis#3236, segment.nextFltNo = flt.nextFltNo
		if (flightIdMap.find(copy->getDBId()) != flightIdMap.end()) {
			auto flt = flightIdMap[copy->getDBId()];
			if (copy->getStartTimeUtcSch() != flt->getStartTimeUtcSch()){
				copy->setIsReCalulateBrief(true);
			}
			copy->copyFltValue(flt.get());
		}
		segmentList.push_back(copy);
	}
	vector<void*>& csvDutySegmentList = reader.datas["PairingDutySegment"];
	for (i = 0; i < csvDutySegmentList.size(); i++) {
		Segment * csvItem = (Segment*)csvDutySegmentList[i];
		Segment * copy = new Segment(*(Segment*)csvDutySegmentList[i]);
		//20180503 ain, mantis#3236, segment.nextFltNo = flt.nextFltNo
		if (flightIdMap.find(copy->getDBId()) != flightIdMap.end()) {
			auto flt = flightIdMap[copy->getDBId()];
			if (copy->getStartTimeUtcAct() != flt->getStartTimeUtcAct()){
				copy->setIsReCalulateBrief(true);
			}
			
			copy->copyFltValue(flt.get());
		}
		else if (ferryFltIdMap.find(copy->getDBId()) != ferryFltIdMap.end()) {
			Segment* flt = ferryFltIdMap.at(copy->getDBId());
			if (copy->getStartTimeUtcSch() != flt->getStartTimeUtcSch()) {
				copy->setIsReCalulateBrief(true);
			}

			copy->copyFltValue(flt);
		}

		//RO专用：从不同部门读取rankComb，再存入seg->rankCombCriteriaId
		if (dbData->getApplicationType() == "OR" && (dbData->scenario.category == "RO" || dbData->scenario.category == "TO")) {
			long long tmpRankCombCriteriaId;
			if (dbData->scenario.division == "P")
				tmpRankCombCriteriaId = copy->getRankCombCP();
			else if (dbData->scenario.division == "C")
				tmpRankCombCriteriaId = copy->getRankCombCC();
			else
				tmpRankCombCriteriaId = copy->getRankCombCA();

			copy->setRankCombCriteriaId(tmpRankCombCriteriaId);
		}

		segmentList.push_back(copy);
	}
	mergeDutyAndSegment(dutyIdMap, segmentList);
	mergePairingAndDuty(pairingIdMap, dutyList);
	//mantis#3317, 填充 segment.domType字段, 若是航班则按 flt.domType否则默认为D
	//mantis#3396, 补齐 pairing segment上来自 flight表数据，如 tailNum
	//20181212 ain, mantis#4611, segment补齐 flt字段统一处理
	for (auto& seg : segmentList) {
		long long fltId = seg->getDBId();
		if (flightIdMap.find(fltId) != flightIdMap.end()) {
			auto flt = flightIdMap[fltId];
			copyFlightFieldToSegment(flt.get(), seg);
		}
	}
	populateNonOperatingFlightServiceType(flightIdMap, segmentList);
	//pairingComp
	vector<void*>& csvPairingCompositionList = reader.datas["PairingComposition"];
	for (size_t i = 0; i < csvPairingCompositionList.size(); i++) {
		csvActivityComposition* pc = new csvActivityComposition(*(csvActivityComposition*)csvPairingCompositionList[i]);
		if (pairingIdMap.find(pc->activityId) == pairingIdMap.end()) {
			Logger::getRuleLogger()->info("invalid data, pairing {} not found for pairing-composition", pc->activityId);
			continue;
		}
		/*if (compositionRankValueMap.find(pc->compId) == compositionRankValueMap.end()) {
			cout << "ERROR: invalid data, pairingComposition pairingId=" << pc->activityId << " compId=" << pc->compId << ", composition not exist" << endl;
		}*/
		if (pairingIdMap.find(pc->activityId) == pairingIdMap.end()) {
			Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, pairingComposition pairingId={}  compId={}, pairing not exist", pc->activityId, pc->compId);
		}
		dbData->pairingCompositionList.push_back(*pc);
		Pairing* pairing = pairingIdMap[pc->activityId];
		//if (pairing->getCompositionId() == 0)
		//	pairing->setCompositionId(pc->compId);
		//shared_ptr<map<string, int>>& rankValue = compositionRankValueMap[pc->compId];
		//for (map<string, int>::iterator it = rankValue->begin(); it != rankValue->end(); it++) {
		//	string rank = it->first;
		//	int value = it->second * pc->multipler;//mantis#2306, plan = value * multipler
		//}
		if (dbData->version == 3) {
			pairing->addComplement(pc->actingRank, pc->planValue);
		}
		else {
			if (compositionRankValueMap.find(pc->compId) == compositionRankValueMap.end()) {
				Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, pairingComposition pairingId={}  compId={}, composition not exist", pc->activityId, pc->compId);
			}
			if (pairing->getCompositionId() == 0)
				pairing->setCompositionId(pc->compId);
			shared_ptr<map<string, int>>& rankValue = compositionRankValueMap[pc->compId];
			if (rankValue) {
                for (map<string, int>::iterator it = rankValue->begin(); it != rankValue->end(); it++) {
                    string rank = it->first;
                    int value = it->second * pc->multipler;//mantis#2306, plan = value * multipler
                    pairing->addComplement(rank, value);
                }
            }
		}
		

		
	}
	//domintType 和 dutyCode 赋值
	for (auto& p : pairingIdMap){
		std::vector<DutyCode::DutyCode> dutyCodes;
		for (auto duty : p.second->getDutyVec()){
			duty->setDomIntType(Utility::GetInstancePtr()->getDutySegType(duty, &(dbData->airportList)));

			for (auto segment : duty->getSegmentsRead()) {
				DutyCode::DutyCode dutyCode;
				if (!segment->getDutyCode().empty() && !segment->getDutyCodeType().empty()) {
					dutyCode.SetDutyType(DutyCode::GetMappedDutyType(segment->getDutyCodeType()));
					dutyCode.SetDutyCode(segment->getDutyCode());
				}
				dutyCodes.emplace_back(dutyCode);
			}
		}
		p.second->SetAssignedDutyCode(dutyCodes);
	}
	for (auto flight : flightIdMap){
		flight.second->setDomIntType(Utility::GetInstancePtr()->getSegType(&(dbData->airportList), flight.second->getDepStation(), flight.second->getArrStation()));
	}
	//若PairingComposition为空则尝试解析 pairingRankValue 
	if (csvPairingCompositionList.size() == 0)
	{
		vector<void*> csvPairingRankValueList = reader.datas["PairingRankValue"];
		for (size_t i = 0; i < csvPairingRankValueList.size(); i++) {
			csvRankValue * item = (csvRankValue*)csvPairingRankValueList[i];
			Pairing* pairing = pairingIdMap[item->activityId];
			pairing->addComplement(item->rank, item->value);
		}
	}

	string dbg = "PairingDutyNode";
	vector<void*> &csvPairingDutyNodeList = reader.datas["PairingDutyNode"];
	for (i = 0; i < csvPairingDutyNodeList.size(); i++) {
		PairingDutyNode* obj = (PairingDutyNode*)csvPairingDutyNodeList[i];
		if (dbData->airportCodeMap[obj->getAirport()]) {
			const char* zoneId = dbData->airportCodeMap.at(obj->getAirport())->zoneId;
			
			obj->setStartLoc(TimezoneUtils::GetLocalTime(obj->getStartUtc(), zoneId));
			obj->setEndLoc(TimezoneUtils::GetLocalTime(obj->getEndUtc(), zoneId));
		}
		//csvPairingDutyNodeList.push_back(shared_ptr<PairingDutyNode>(new PairingDutyNode(*(PairingDutyNode*)obj)));
		if (dutyIdMap.find(obj->getDutyId()) != dutyIdMap.end()) {
			dutyIdMap[obj->getDutyId()]->pairingDutyNodes.push_back(shared_ptr<PairingDutyNode>(obj));
		}
	}
	csvPairingDutyNodeList.clear();//duty内放入原始 csv对象，clear避免随csv释放

	//20210106 3.0时间字段赋值
	if (dbData->version == 3) {
		for (auto p : pairingIdMap) {
			Pairing* pairing = p.second;
			if (!dataChecker.checkDutyEmpty(pairing)) {
				dbData->GetDataError()->record(pairing);
				continue;
			}
			fillPairingAndDutyField(pairing, dbData->airportCodeMap);
			if (dbData->scenario.airline == "GJ") {
				pairing->setEndTimeIncludingRest();
			}
		}
	}

	fixPairingDuty(dbData); //修正Duty和PairingDutyNode可能错误

	//提前释放
	ClearCsvReaderData(Pairing, csvPairingList);
	ClearCsvReaderData(Duty, csvDutyList);
	ClearCsvReaderData(Segment, csvSegmentList);
	ClearCsvReaderData(csvActivityComposition, csvPairingCompositionList);
}

//读取csv composition/composition_rank, 输出compositionRankValueMap
void loadCompositionRank(map<long long, shared_ptr<map<string, int>>>& compositionRankValueMap, map<long long, string>& rankIdMap, crewCsvReader& reader, CrewDataContext* dbData) {

	size_t i = 0;
	vector<void*> csvCompositionList = reader.datas["Composition"];
	vector<void*> csvCompositionRankList = reader.datas["CompositionRank"];
	for (i = 0; i < csvCompositionList.size(); i++) {
		csvComposition* c = (csvComposition*)csvCompositionList[i];
		compositionRankValueMap[c->compId] = shared_ptr <map<string, int>>(new map<string, int>());
	}
	for (i = 0; i < csvCompositionRankList.size(); i++) {
		csvCompositionRank* cr = (csvCompositionRank*)csvCompositionRankList[i];
		if (compositionRankValueMap.find(cr->compId) == compositionRankValueMap.end()) {
			Logger::getRuleLogger()->error("invalid data, compositionRankValueMap composition not found compId={}", cr->compId);
			continue;
		}
		shared_ptr<map<string, int>>& composition = compositionRankValueMap[cr->compId];
		string rank = rankIdMap[cr->rankId];
		if (composition->find(rank) == composition->end())
			(*composition)[rank] = 0;
		(*composition)[rank] = (*composition)[rank] + cr->planValue;
	}
	for (i = 0; i < csvCompositionList.size(); i++) {
		csvComposition* c = (csvComposition*)csvCompositionList[i];
		Composition item(c->compId, c->name, c->hirarchy, c->airline, c->division, c->displayOrder);
		dbData->compositionList.push_back(item);

		dbData->compositionRankMap.insert(make_pair(c->compId, composition_rank()));
		strncpy(dbData->compositionRankMap[c->compId].airline, c->airline.c_str(), SIZE_AIRLINE);
		strncpy(dbData->compositionRankMap[c->compId].division, c->division.c_str(), 1);
		dbData->compositionRankMap[c->compId].comp_id = c->compId;
		dbData->compositionRankMap[c->compId].hierarchy = c->hirarchy;


		unordered_map<int, composition_rank> map;
		dbData->compositionRankOptionMap.insert(make_pair(c->compId, map));
	}
	for (i = 0; i < csvCompositionRankList.size(); i++) {
		
		csvCompositionRank* cr = (csvCompositionRank*)csvCompositionRankList[i];
		if (dbData->compositionRankMap.find(cr->compId) == dbData->compositionRankMap.end()) {
			Logger::getRuleLogger()->error("invalid data, compositionRankMap composition not found compId={}", cr->compId);
			continue;
		}
		if (rankIdMap.find(cr->rankId) == rankIdMap.end()) {
			Logger::getRuleLogger()->error("invalid data, composition_rank.comp_id={} rank_id={} not found in RANK", cr->compId, cr->rankId);
			continue;
		}
		composition_rank& composition = dbData->compositionRankMap[cr->compId];
		string rank = rankIdMap[cr->rankId];
		int index = dbData->compositionRankMap[cr->compId].rankCount;
		if (index < COMPOSITION_RANK_MAX_COUNT - 1) {
			strncpy(dbData->compositionRankMap[cr->compId].rankValue[index].rank, rank.c_str(), rank.length());
			dbData->compositionRankMap[cr->compId].rankValue[index].plan_value = cr->planValue;
			dbData->compositionRankMap[cr->compId].rankCount++;
		}
		else {
			Logger::getRuleLogger()->error("Fatal error, composition_rank index overflow.comp_id={}", cr->compId);
		}
	
		if (cr->planValue == 0) {
			continue;
		}
		// 3.0 支持多个option
		if (dbData->compositionRankOptionMap[cr->compId].find(cr->option) == dbData->compositionRankOptionMap[cr->compId].end()) {
			dbData->compositionRankOptionMap[cr->compId].insert(make_pair(cr->option, composition_rank()));
		}
		int idx = dbData->compositionRankOptionMap[cr->compId][cr->option].rankCount;
		strncpy(dbData->compositionRankOptionMap[cr->compId][cr->option].rankValue[idx].rank, rank.c_str(), rank.length());
		dbData->compositionRankOptionMap[cr->compId][cr->option].rankValue[idx].plan_value = cr->planValue;
		dbData->compositionRankOptionMap[cr->compId][cr->option].rankCount++;
		dbData->compositionRankOptionMap[cr->compId][cr->option].hierarchy = composition.hierarchy;


		if (dbData->compositionRankMap[cr->compId].rankCount > COMPOSITION_RANK_MAX_COUNT) {
			Logger::getRuleLogger()->error("invalid data, compositionRank.Count > {}", COMPOSITION_RANK_MAX_COUNT);
		}
	}
}

void loadCompositionLoad(CrewDataContext* dbData, crewCsvReader& reader) {
	size_t i = 0;
	vector<void*>& csvList = reader.datas["CompositionLoad"];
	for (i = 0; i < csvList.size(); i++) {
		CompositionLoad* row = (CompositionLoad*)csvList[i];
		dbData->compositionLoadList.push_back(*row);
	}
	ClearCsvReaderData(CompositionLoad, csvList);
}

void loadCsvFlightCommute(CrewDataContext* dbData, crewCsvReader& reader) {
	size_t i = 0;
	unordered_map<long long, Segment*> ferryFltMap;
	vector<void*> csvCommuteFlight = reader.datas["Flight(COMMUTE)"];
	for (i = 0; i < csvCommuteFlight.size(); i++) {
		Segment* seg = new Segment(*(Segment*)csvCommuteFlight[i]);
		//mantis#3310, 补齐flight.isOperating/isDhd/isFerry初始化
		if (dbData->version == 3) {
			fillSegmentLocTimeField(seg, dbData->airportCodeMap, dbData);
		}
		seg->setIsOperating(false);
		// EVA FD use assignment code :HSR: as train assignment
        if (seg->getAssignment() == "TRAIN" || seg->getAssignment() == "HSR") {
            seg->setIsTrainFerry(true);
            seg->setIsDeadhead(false);
        } else {
            seg->setIsTrainFerry(false);
            seg->setIsDeadhead(true);
        }
        seg->setIsBusFerry(false);
		seg->setIsDummyBusFerry(false);
		//20180508 ain, mantis#3310, 补齐赋值 flt._depMinuteFromDayBegin/setArrMinutesFromDayBegin/date/dayInt
		fillSegmentDateField(seg);
		string fltNum = seg->getFlightNumber();
		/*if (!fltNum.empty() && 'D' != fltNum.at(fltNum.length() - 1)) {
		seg->setFlightNumber(fltNum + "D");
		}*/
		dbData->pairingInputFerrys.push_back(seg);
		ferryFltMap[seg->getDBId()] = seg;
	}
	//20180522 ain, ferry flight按 flt_id排序, 以便对比PO单机版
	stable_sort(dbData->pairingInputFerrys.begin(), dbData->pairingInputFerrys.end(),
		[](Segment * a, Segment * b) -> bool
	{
		return a->getDBId() < b->getDBId();
	});
	//flight composition -> flight
	vector<void*> csvFlightCompositionList = reader.datas["FlightComposition(COMMUTE)"];
	for (i = 0; i < csvFlightCompositionList.size(); i++) {
		csvActivityComposition* fc = (csvActivityComposition*)csvFlightCompositionList[i];
		if (ferryFltMap.find(fc->activityId) == ferryFltMap.end()) {
			Logger::getRuleLogger()->info("invalid data, flight {} not found for flight-composition", fc->activityId);
			continue;
		}
		Segment* flt = ferryFltMap[fc->activityId];
		composition_rank& rankValue = dbData->compositionRankMap[fc->compId];
		for (int i = 0; i < rankValue.rankCount; i++) {
			rank_value& cr = rankValue.rankValue[i];
			string rank = cr.rank;
			int value = cr.plan_value;
			flt->addPlanComposition(rank, value * fc->multipler);
			//bug: generateDuty need seg.compID
			flt->setCompositionId(fc->compId);
		}
	}

	int rollingDay = getRollingDaysFromRuleList(dbData->cqfList2);
	unordered_map<string, daylight_saving> daylightSavingMap;
	vector<void*> csvCommutes = reader.datas["CommuteSchedule"];
	long long busId = 0;
	for (i = 0; i < csvCommutes.size(); i++) {
		csvCommuteSchedule* cs = (csvCommuteSchedule*)csvCommutes[i];
		vector<Segment*> tmp;
		//20180611 ain, mantis#3467, ferry生成增加 rollingDay日期范围
		makeSegmentByCommuteSchedule(cs, dbData->scenario.airline, dbData->scenario.startDtUTC, dbData->scenario.endDtUTC + (1 + rollingDay) * 24 * 3600, busId, dbData->airportUtcOffsetMap, daylightSavingMap, tmp);
		//mantis#3310, 补齐flight.isOperating/isDhd/isFerry初始化
		for (Segment* seg : tmp) {
			seg->setIsOperating(false);
			seg->setIsDeadhead(false);
			seg->setIsBusFerry(seg->getFleetCD() == "BUS");
			seg->setIsTrainFerry(seg->getFleetCD() != "BUS");
			seg->setIsDummyBusFerry(false);
		}
		//dbData->pairingInputFerrys.insert(dbData->pairingInputFerrys.end(), tmp.begin(), tmp.end());
		dbData->pairingInputFerrys.insert(dbData->pairingInputFerrys.end(), tmp.begin(), tmp.end());
	}
	dbData->ferryFltIdMap = ferryFltMap;
}

void loadAssignmentAndGroup(CrewDataContext* dbData, crewCsvReader& reader) {
	size_t i = 0;
	vector<void*> assignmentList = reader.datas["Assignment"];
	for (i = 0; i < assignmentList.size(); i++) {
		ASSIGNMENT* obj = (ASSIGNMENT*)assignmentList[i];
		dbData->totalAssignmentIdMap[obj->ASSIGNMENT_ID] = shared_ptr<ASSIGNMENT>(new ASSIGNMENT(*(ASSIGNMENT*)obj));
	}
	vector<void*> assignmentGroupList = reader.datas["AssignmentGroup"];
	for (i = 0; i < assignmentGroupList.size(); i++) {
		ASSIGNMENT_GROUP* obj = (ASSIGNMENT_GROUP*)assignmentGroupList[i];
		dbData->totalAssignGrps.push_back(*obj); //mantis#2366, 填充 dataCtx.totalAssignGrps
	}
	map<long long, ASSIGNMENT_GROUP*> assignmentGrpIdMap;
	for (auto& item : dbData->totalAssignGrps) {
		assignmentGrpIdMap[item.assignGrpId] = &item;
	}
	vector<void*> assignmentGroupMapList = reader.datas["AssignmentGroupMap"];
	for (i = 0; i < assignmentGroupMapList.size(); i++) {
		ASSIGNMENT_GROUP_MAP* obj = (ASSIGNMENT_GROUP_MAP*)assignmentGroupMapList[i];
		if (dbData->totalAssignmentIdMap.find(obj->assignId) == dbData->totalAssignmentIdMap.end())
		{
			//cout << "no " << obj->assignId << endl;
			continue;
		}
		string assignment = dbData->totalAssignmentIdMap[obj->assignId]->assignment;
		ASSIGNMENT_GROUP* group = assignmentGrpIdMap[obj->assignGrpId];
		if (group == NULL){
			Logger::getRuleLogger()->error("AssighmentGroup Id: {} Not find", obj->assignGrpId);
			continue;
		}
		auto itGrp = dbData->assignmentNameGroupMap.find(group->assignGrp);
		if (itGrp == dbData->assignmentNameGroupMap.end()) {
			dbData->assignmentNameGroupMap.insert(make_pair(group->assignGrp, unordered_set<string>()));
		}
		dbData->assignmentNameGroupMap[group->assignGrp].insert(assignment);
	}
	for (auto& assignName : dbData->assignmentNameGroupMap["OVERLAPABLE"]) {
		dbData->overlapableAssignmentMap[assignName] = true;
	}
	vector<void*> assignmentOverlappableList = reader.datas["AssignmentOverlappable"];
	for (i = 0; i < assignmentOverlappableList.size(); i++) {
		ASSIGNMENT_OVERLAPPABLE* obj = (ASSIGNMENT_OVERLAPPABLE*)assignmentOverlappableList[i];
		SharedPtr<ASSIGNMENT_OVERLAPPABLE> shareObj = SharedPtr<ASSIGNMENT_OVERLAPPABLE>(new ASSIGNMENT_OVERLAPPABLE(*(ASSIGNMENT_OVERLAPPABLE*)obj));
		dbData->assignmentOverlappable.push_back(shareObj);
		
		if (obj->type == "MRT_OVERRIDE"){
			dbData->assignmentMrtOveride.push_back(shareObj);//assignmentMrtOveride中assignmentOverlappable的ASSIGNMENT_OVERLAPPABLE不需要创建
		}

		if (obj->type == "OVERLAPPABLE") {
			dbData->assignmentOverlappableType.push_back(shareObj);
		}
	}
	for (i = 0; i < assignmentGroupMapList.size(); i++) {
		ASSIGNMENT_GROUP_MAP* obj = (ASSIGNMENT_GROUP_MAP*)assignmentGroupMapList[i];
		if (dbData->totalAssignmentIdMap.find(obj->assignId) == dbData->totalAssignmentIdMap.end())
		{
			Logger::getRuleLogger()->error("Assignment does not exist. assignId={}", obj->assignId);
			continue;
		}
		shared_ptr<ASSIGNMENT> assignment = dbData->totalAssignmentIdMap[obj->assignId];
		auto iterAssGrp = assignmentGrpIdMap.find(obj->assignGrpId);
		if (iterAssGrp != assignmentGrpIdMap.end() && iterAssGrp->second != nullptr) {
			ASSIGNMENT_GROUP* group = iterAssGrp->second;
			SharedPtr<DBRule_8014> item(new DBRule_8014);
			item->airline = assignment->AIRLINE;
			item->assignemnt = assignment->assignment;
			item->assignmentGroup = group->assignGrp;
			item->name = group->name;
			item->roIndicator = group->roIndicator;
			dbData->rule_8014.push_back(item);
		}
		else {
			Logger::getRuleLogger()->error("Assignment Group does not exist. assignGroupId={}", obj->assignGrpId);
		}
	}
	for (auto& a : dbData->totalAssignmentIdMap) {
		if (a.second != NULL)
			dbData->assignmentNameMap[a.second->assignment] = a.second;
	}
	//20190829 ain, mantis#6565, 重构 assignmentHolder全局 singleton模式, 以便于roster/ptn/duty/seg中获取
	for (auto& it : dbData->assignmentNameMap) {
		SharedPtr<ASSIGNMENT> item = it.second;
		AssignmentHolder::getInst().add(*item.get());
	}

	PersistentDataSingleton::instance()->SetAssignmentGroupSetting(dbData->assignmentNameGroupMap);
}

void loadRuleSet(CrewDataContext* dbData, crewCsvReader& reader) {
	vector<void*> csvRuleSetList = reader.datas["RuleSet"];
	for (size_t i = 0; i < csvRuleSetList.size(); i++) {
		RuleSet* obj = (RuleSet*)csvRuleSetList[i];
		dbData->ruleSetList.push_back(shared_ptr<RuleSet>(new RuleSet(*(RuleSet*)obj)));
	}
}

void loadRule(CrewDataContext* dbData, crewCsvReader& reader) {
	size_t i = 0;
	//rule
	{
		vector<void*>& csvRuleList = reader.datas["Rule"];
		map<long long, DBRule*> ruleIdMap;
		for (i = 0; i < csvRuleList.size(); i++) {
			DBRule * item = (DBRule*)csvRuleList[i];
			ruleIdMap[item->idRule] = item;
		}
		vector<void*>& csvRuleParamList = reader.datas["RuleParameter"];
		map<string, vector<string>> ruleIdHeaderMap; //key=ruleId_tableNum
		//headers
		for (i = 0; i < csvRuleParamList.size(); i++) {
			csvRuleParam * item = (csvRuleParam*)csvRuleParamList[i];
			if (strToUpper(item->paramNames).find("TABLE") != -1 && strToUpper(item->paramNames).find("HEADER") != -1) {
				vector<string> headers;
				split(item->paramValues, ',', headers);
				//mantis#2969, param name转大写， param value保持原始大小写
				for (size_t j = 0; j < headers.size(); j++) {
					headers[j] = strToUpper(headers[j]);
				}

				char tableStr[100] = { 0 };
				getTableNumFromNameStr(item->paramNames.c_str(), tableStr, sizeof(tableStr));

				stringstream key;
				key << item->ruleId << tableStr;
				ruleIdHeaderMap[key.str()] = headers;
			}
		}
		//values
		for (i = 0; i < csvRuleParamList.size(); i++) {
			csvRuleParam * item = (csvRuleParam*)csvRuleParamList[i];
			auto iterRule = ruleIdMap.find(item->ruleId);
			if (iterRule == ruleIdMap.end()) {
				continue;
			}
			DBRule * originObj = iterRule->second;
			//20180503 ain, mantis#3222, rule 8011
			if (originObj->function == RULE_FUNC_Port_Qual) {
				DBRule rule = makeMixRuleByCsv(originObj, dbData->scenario.idRuleSet, item);
				dbData->ruleList.push_back(rule);
			}
			//Mix
			else if (0 == strcmp(originObj->storeType, "Mix") || 0 == strcmp(originObj->storeType, "")) {
				DBRule rule = makeMixRuleByCsv(originObj, dbData->scenario.idRuleSet, item);
				dbData->ruleList.push_back(rule);
			}
			//Table
			else if (strToUpper(item->paramNames).find("TABLE") != -1 && strToUpper(item->paramNames).find("ROW") != -1) {
				DBRule rule = makeTableRuleByCsv(ruleIdHeaderMap, originObj, dbData->scenario.idRuleSet, item);
				dbData->ruleList.push_back(rule);
			}
		}
		parseRuleParams(dbData->ruleList, dbData->rule_8014); //预处理rule param
	}
 	sort(dbData->ruleList.begin(), dbData->ruleList.end(), DBRule::compare);
}

void loadAllRule(CrewDataContext* dbData, crewCsvReader& reader) {
	size_t i = 0;
	//rule
	{
		vector<void*>& csvRuleList = reader.datas["Rule(ALL)"];
		map<long long, DBRule*> ruleIdMap;
		for (i = 0; i < csvRuleList.size(); i++) {
			DBRule* item = (DBRule*)csvRuleList[i];
			ruleIdMap[item->idRule] = item;
		}
		vector<void*>& csvRuleParamList = reader.datas["RuleParameter(ALL)"];
		map<string, vector<string>> ruleIdHeaderMap; //key=ruleId_tableNum
		//headers
		for (i = 0; i < csvRuleParamList.size(); i++) {
			csvRuleParam* item = (csvRuleParam*)csvRuleParamList[i];
			if (strToUpper(item->paramNames).find("TABLE") != -1 && strToUpper(item->paramNames).find("HEADER") != -1) {
				vector<string> headers;
				split(item->paramValues, ',', headers);
				//mantis#2969, param name转大写， param value保持原始大小写
				for (size_t j = 0; j < headers.size(); j++) {
					headers[j] = strToUpper(headers[j]);
				}

				char tableStr[100] = { 0 };
				getTableNumFromNameStr(item->paramNames.c_str(), tableStr, sizeof(tableStr));

				stringstream key;
				key << item->ruleId << tableStr;
				ruleIdHeaderMap[key.str()] = headers;
			}
		}
		//values
		for (i = 0; i < csvRuleParamList.size(); i++) {
			csvRuleParam* item = (csvRuleParam*)csvRuleParamList[i];
			DBRule* originObj = ruleIdMap[item->ruleId];
			//20180503 ain, mantis#3222, rule 8011
			if (originObj->function == RULE_FUNC_Port_Qual) {
				DBRule rule = makeMixRuleByCsv(originObj, -1, item);
				if (!rule.params.empty()) {
					dbData->allRuleList.push_back(rule);
				}
			}
			//Mix
			else if (0 == strcmp(originObj->storeType, "Mix") || 0 == strcmp(originObj->storeType, "")) {
				DBRule rule = makeMixRuleByCsv(originObj, -1, item);
				if (!rule.params.empty()) {
					dbData->allRuleList.push_back(rule);
				}
			}
			//Table
			else if (strToUpper(item->paramNames).find("TABLE") != -1 && strToUpper(item->paramNames).find("ROW") != -1) {
				DBRule rule = makeTableRuleByCsv(ruleIdHeaderMap, originObj, -1, item);
				if (!rule.params.empty()) {
					dbData->allRuleList.push_back(rule);
				}
			}
		}
		parseRuleParams(dbData->allRuleList, dbData->rule_8014); //预处理rule param
	}
	sort(dbData->allRuleList.begin(), dbData->allRuleList.end(), DBRule::compare);
}

void loadCqf(CrewDataContext* dbData, crewCsvReader& reader) {
	size_t i = 0;
	map<string, vector<string>> cqfIdHeaderMap;
	//cqf
	{
		vector<void*>& csvCqfList = reader.datas["Cqf"];
		map<long long, DBRule*> cqfIdMap;
		for (i = 0; i < csvCqfList.size(); i++) {
			DBRule * item = (DBRule*)csvCqfList[i];
			cqfIdMap[item->idRule] = item;
		}
		vector<void*>& csvCqfParamList = reader.datas["CqfParameter"];
		//headers
		for (i = 0; i < csvCqfParamList.size(); i++) {
			csvRuleParam * item = (csvRuleParam*)csvCqfParamList[i];
			vector<string> headers;

			//header key: cqfId + tableNum
			//for Mix: 4004001, for Table: 4004001table, for MultiTable: 4004001table1
			char tableStr[100] = { 0 };
			getTableNumFromNameStr(item->paramNames.c_str(), tableStr, sizeof(tableStr));
			stringstream key;
			key << item->ruleId << tableStr; 

			if (0 == strcmp(cqfIdMap[item->ruleId]->storeType, "Mix") || 0 == strlen(cqfIdMap[item->ruleId]->storeType)) {
				split(item->paramNames, ',', headers);
				cqfIdHeaderMap[key.str()] = headers;
			}
			else if (item->paramNames.find("table") != -1 && item->paramNames.find("Header") != -1) {
				split(item->paramValues, ',', headers);
				cqfIdHeaderMap[key.str()] = headers;
			}

		}
		//values
		for (i = 0; i < csvCqfParamList.size(); i++) {
			csvRuleParam * item = (csvRuleParam*)csvCqfParamList[i];
			DBRule * originObj = cqfIdMap[item->ruleId];
			//Mix
			if (0 == strcmp(originObj->storeType, "Mix") || 0 == strcmp(originObj->storeType, "")) {
				DBRule rule = makeMixRuleByCsv(originObj, dbData->scenario.idRuleSet, item);
				dbData->cqfList2.push_back(rule);
			}
			else if (item->paramNames.find("table") != -1 && item->paramNames.find("Row") != -1) {
				csvRuleParam * item = (csvRuleParam*)csvCqfParamList[i];
				DBRule cqf = makeTableRuleByCsv(cqfIdHeaderMap, originObj, dbData->scenario.idRuleSet, item);
				dbData->cqfList2.push_back(cqf);
			}
		}
	}
	std::sort(dbData->cqfList2.begin(), dbData->cqfList2.end(), DBRule::compare);
	//make cqf obj by rule obj
	{
		//cqfList
		map<long long, DBCqf> cqfIdMap;
		for (i = 0; i < dbData->cqfList2.size(); i++) {
			DBRule cqf2 = dbData->cqfList2[i];
			long long cqfId = cqf2.idRule;

			//header key: cqfId + tableNum
			//for Mix: 4004001, for Table: 4004001table, for MultiTable: 4004001table1
			stringstream headerMapKey;
			headerMapKey << cqf2.idRule;
			if (0 == strcmp(cqf2.storeType, "Table")) {
				headerMapKey << "table";
			}
			else if (0 == strcmp(cqf2.storeType, "MultiTable")) {
				headerMapKey << "table" << cqf2.tableNum;
			}
			string headerKey = headerMapKey.str();
			vector<string> headers = cqfIdHeaderMap[headerMapKey.str()];
			if (headers.empty()) {
				Logger::getRuleLogger()->error("invalid data, parse CQF fail, idRule={}", cqf2.idRule);
				continue;
			}

			if (cqfIdMap.find(cqf2.idRule) == cqfIdMap.end()) {
				DBCqf item;
				item.idCqf = cqf2.idRule;
				item.idCqfSet = cqf2.idRuleSet;
				item.function = cqf2.function;
				item.description = cqf2.description;

				item.paramNames = joinStrList(headers, ",");
				cqfIdMap[cqfId] = item;
			}
			else {
			}

			stringstream values;
			bool first = true;
			for (string name : headers) {
				if (first) {
					first = false;
				}
				else {
					values << ",";
				}
				values << cqf2.params[name];
			}
			cqfIdMap[cqfId].paramValues.push_back(values.str());
		}
		for (auto& entry : cqfIdMap) {
			dbData->cqfList.push_back(entry.second);
		}
	}
}

void loadPortQualReqmnt(CrewDataContext* dbData, crewCsvReader& reader) {
	//portQualReqmnt / map
	vector<void*>& csvPortQualReqmntList = reader.datas["PortQualReqmnt"];
	for (size_t i = 0; i < csvPortQualReqmntList.size(); i++) {
		DBPortQualReqmnts* fc = (DBPortQualReqmnts*)csvPortQualReqmntList[i];
		dbData->portQualReqmnts.push_back(*fc);
	}
	dbData->portQualReqmntsAirportMap = makePortQualReqmntsAirportMap(dbData->portQualReqmnts);
}

void loadQualExtensionConfig(CrewDataContext* dbData, crewCsvReader& reader) {
	vector<void*>& csvQualExtensionConfigList = reader.datas["QualExtensionConfig"];
	for (size_t i = 0; i < csvQualExtensionConfigList.size(); i++) {
		QualExtensionConfig* qec = (QualExtensionConfig*)csvQualExtensionConfigList[i];

		dbData->qualExtensionConfigList.push_back(std::make_shared<QualExtensionConfig>(*qec));
	}

	for (const auto& config : dbData->qualExtensionConfigList) {
		for (const auto& assignment : config->assignments) {
			auto iterQualMap = dbData->qualExtensionConfigMap.find(assignment);
			if (iterQualMap == dbData->qualExtensionConfigMap.end()) {
				multimap<string, std::shared_ptr<QualExtensionConfig>> qualMap;
				for (const auto& qual : config->qualifications) {
					qualMap.insert(std::make_pair(qual, config));
				}
				dbData->qualExtensionConfigMap.insert(std::make_pair(assignment, qualMap));
			}
			else {
				for (const auto& qual : config->qualifications) {
					iterQualMap->second.insert(std::make_pair(qual, config));
				}
			}
		}
	}
}

//从csv读取roster
void loadCsvRoster( CrewDataContext* dbData, crewCsvReader& reader, string dataName) {
		map<string, long long> errorRosterCrewMap;
		vector<void*> &csvRosterList = reader.datas[dataName];
		vector< SharedPtr<ROSTER>> copies;
		for (std::size_t i = 0; i < csvRosterList.size(); i++) {
			SharedPtr<ROSTER> copy = shared_ptr<ROSTER>(new ROSTER(*(ROSTER*)csvRosterList[i]));

			//crewIdPairingIdToRoster[copy->idcrew][copy->pairId] = copy;

			//20180402 ain, mantis#3079, 补齐src=PA
			if (copy->idscenario == 0 && dbData->scenarioId != 0) {
				copy->source = "PA";
				copy->sourceType = ROSTER_SOURCE_PRE_ASSIGN;
			}

			// do not need to check rules for any roster, pre-assigned or not
			// only need to check rules for new assignment in current RO run.
			copy->needRuleCheck = false;

			dbData->rosterList.push_back(copy);
			if (copy->source == "PA" && dataName == "RosterGround")
				dbData->preAssignRosterGroundList.push_back(copy);
			copies.push_back(copy);
		}
		//index crew->roster
		for (auto& roster : copies) {
			if (dbData->crewIdMap.find(roster->idcrew) == dbData->crewIdMap.end()) {
				errorRosterCrewMap[roster->idcrew] = roster->rosterId;
			}
			else {
				shared_ptr<CREW> crew = dbData->crewIdMap[roster->idcrew];
				crew->rosterList.push_back(roster);
			}
		}
		//sort crew.rosterList
		for (auto& it : dbData->crewIdMap) {
			shared_ptr<CREW> crew = it.second;
			std::stable_sort(crew->rosterList.begin(), crew->rosterList.end(), compareRosterByStartDT);
		}
		//mantis#2308, index roster->pairing
		for (auto& it : dbData->crewIdMap) {
			for (auto& roster : it.second->rosterList) {
				if (roster->pairId != 0) {
					if (dbData->pairingIdMap.find(roster->pairId) == dbData->pairingIdMap.end()) {
						Logger::getRuleLogger()->info("ERROR: invalid data, pairing({}) of roster={} not loaded, set roster.pairing_id=0", roster->pairId, roster->rosterId);
						//Logger::getRuleLogger()->error("invalid data");
						//20191128 ain, mantis#7159, 问题4, 容忍错误数据pairing不存在时赋值roster.pair_id=0
						roster->pairId = 0;
					}
					else {
						roster->pairing = dbData->pairingIdMap[roster->pairId];
					}
				}
			}
		}
		//error: roster.crew not match scenario
		for (auto& e : errorRosterCrewMap) {
			Logger::getRuleLogger()->info("ERROR: invalid data, roster={} crew={} not match scenario", e.second, e.first.c_str());
		}
		//ROSTER数量最多，提前释放
		ClearCsvReaderData(ROSTER, csvRosterList);
		Logger::getRuleLogger()->debug("After load {} mem={} MB", dataName, (getProcessCurrentMem() / (1024 * 1024)));
	
}


#define DEFAULT_REST_HOURS 10
//mantis#9363, ver 3.0, RosterGround时间字段填充
//从csv读取rosterGround
//因RosterGround自身维护时间字段 strUtc、endUtc，因此额外增加时间转换字段
void loadCsvRosterGround(CrewDataContext* dbData, crewCsvReader& reader, string dataName) {

	loadCsvRoster(dbData, reader, dataName);

	//按strUtc, endUtc填充其他时间字段
	for (auto& it : dbData->crewIdMap) {
		auto& crew = it.second;
		for (auto& roster : crew->rosterList) {

			//地面任务
			if (roster->pairId == 0) {
				//default rest hours

				//2023.06.06 修复roster ground的数据库中休息时间没有被正确设置（数据库中地面休息时间没有包括在actEndUtc里）
				//roster->endUtc = roster->restStrUtc;
				//roster->actEndUtc = roster->actRestStrUtc;

				const auto& assignment = roster->qualifier;
				int defaultRestTime = 0;
				if (dbData->assignmentNameMap.find(assignment) != dbData->assignmentNameMap.end())
					defaultRestTime = dbData->assignmentNameMap[assignment]->REST_TIME < 0 ? 0 : dbData->assignmentNameMap[assignment]->REST_TIME;
				roster->endUtc = roster->restStrUtc + defaultRestTime * 60;
				roster->actEndUtc = roster->actRestStrUtc + defaultRestTime * 60;
					
				
				//2023.06.25 防止rosterGround中restEndUtc字段为空，增加防护措施
				if (roster->endUtc == -1 && roster->actEndUtc == -1) {
					roster->endUtc = roster->restStrUtc;
					roster->actEndUtc = roster->actRestStrUtc;
				}
				//错误的location数据导致数据加载失败
				//增加保护，location异常时用crew base
				string location = roster->location;
				if (dbData->airportCodeMap.find(roster->location) == dbData->airportCodeMap.end()) {
					Logger::getRuleLogger()->error("ERROR: invalid data, rosterGround={} crew={} invalid location={}", roster->rosterId, crew->idCrew, roster->location);
					location = crew->getPrimeBase();
				}
				//utc + timezone --> loc
				const char* zoneId = dbData->airportCodeMap.at(location)->zoneId;
				roster->actStrLoc = TimezoneUtils::GetLocalTime(roster->actStrUtc, zoneId);
				roster->actRestStrLoc = TimezoneUtils::GetLocalTime(roster->actRestStrUtc, zoneId);
				roster->actEndLoc = TimezoneUtils::GetLocalTime(roster->actEndUtc, zoneId);

				//act_loc --> sch_loc
				roster->strLoc = roster->actStrLoc;
				roster->restStrLoc = roster->actRestStrLoc;
				roster->endLoc = roster->actEndLoc;
			}
		}
	}
}

//创建索引：crewId + pairingId --> roster
void makeIndexCrewIdPairingIdToRoster(CrewDataContext* dbData, map<string, map<long long, shared_ptr<ROSTER>>>& crewIdPairingIdToRoster) {

	for (auto& it : dbData->crewIdMap) {
		string crewId = it.first;
		auto& crew = it.second;
		for (auto& roster : crew->rosterList) {
			if (0 != roster->pairId)
				crewIdPairingIdToRoster[roster->idcrew][roster->pairId] = roster;
		}
	}
}

//按manday.dateLoc筛选保存范围
void saveMandayToCsvStream(ofstream &outfile, time_t startDtLoc, time_t endDtLoc, crewCsvReader& reader, CrewDataContext* dbData) {

	Logger::getRuleLogger()->info("saveMandayToCsvStream startDtLoc={} endDtLoc={}",
		utcToUtcString(startDtLoc).c_str(),utcToUtcString(endDtLoc).c_str());

	//CrewMandayCcAm
	shared_ptr<csvParser> mandayCcParser = reader.getParser("CrewMandayCcAm");
	shared_ptr<csvParser> mandayFdParser = reader.getParser("CrewMandayFd");
	vector<void*> mandayCcList;
	for (auto& crew : dbData->crewList) {
		for (auto& mday : crew->mandayCcAmList) {
			if (mday->dateLoc >= startDtLoc && mday->dateLoc <= endDtLoc) {
				mday->idScenario = dbData->scenarioId;
				mandayCcList.push_back(mday.get());
			}
		}
	}
	//修正manday.scenarioId
	vector<void*> mandayFdList;
	for (auto& crew : dbData->crewList) {
		for (auto& mday : crew->mandayFdList) {
			if (mday->dateLoc >= startDtLoc && mday->dateLoc <= endDtLoc) {
				mday->idScenario = dbData->scenarioId;
				mandayFdList.push_back(mday.get());
			}
		}
	}
	reader.write(outfile, "CrewMandayCcAm", mandayCcList, mandayCcParser);
	reader.write(outfile, "CrewMandayFd", mandayFdList, mandayFdParser);

}

inline static bool sameCreidtOrWorkingHour(shared_ptr<ROSTER>& roster, const unordered_map<long long, std::shared_ptr<ROSTER>>& orgRosterMap) {
	auto it = orgRosterMap.find(roster->rosterId);
	if (it == orgRosterMap.end() || it->second == nullptr) {
		return true;
	}
	auto& orgRoster = it->second;
	return ((int)roster->creditMinutes == (int)orgRoster->creditMinutes) && ((int)roster->fmCreditMinutes == (int)orgRoster->fmCreditMinutes)
		&& ((int)roster->schCreditMinutes == (int)orgRoster->schCreditMinutes) && ((int)roster->schFmCreditMinutes == (int)orgRoster->schFmCreditMinutes)
		&& ((int)roster->workingHour == (int)orgRoster->workingHour);
}

void saveGroundRosterToCsvStream(ofstream& outfile, time_t startDtLoc, time_t endDtLoc, const unordered_map<long long, std::shared_ptr<ROSTER>>& orgRosterMap, CrewDataContext* dbData) {
	Logger::getRuleLogger()->info("saveGroundRosterToCsvStream startDtLoc={} endDtLoc={}",
		utcToUtcString(startDtLoc).c_str(), utcToUtcString(endDtLoc).c_str());

	int count = 0;
	for (auto& crew : dbData->crewList) {
		for (auto& roster : crew->rosterList) {
			if (roster->pairing == nullptr && (roster->idscenario == dbData->scenarioId || roster->idscenario == 0)) {
				count++;
			}
		}
	}

	outfile << "\n";
	outfile << "------Roster(" << count << "):id,scenarioId,pairingId,crewId,creditedMinutes,fmCreditedMinutes,schCreditedMinutes,schFmCreditedMinutes,workingHour,schWorkingHour\n";

	for (auto& crew : dbData->crewList) {
		for (auto& roster : crew->rosterList) {
			if (roster->pairing == nullptr && (roster->idscenario == dbData->scenarioId || roster->idscenario == 0)) {
				if (sameCreidtOrWorkingHour(roster, orgRosterMap)) {
					continue;
				}
				outfile << roster->rosterId <<"^" << roster->idscenario << "^" << roster->pairId << "^" << roster->idcrew << "^" << roster->creditMinutes << "^" << roster->fmCreditMinutes << "^"
					<< roster->schCreditMinutes << "^" << roster->schFmCreditMinutes << "^" << roster->workingHour << "^" << roster->schWorkingHour << "^" << "\n";
			}
		}
	}
}

//20190914 ain, OP#2279, 重算历史号位
void saveRosterFlightToCsvStream(ofstream &outfile, time_t startDtLoc, time_t endDtLoc, vector<long long>& flightIds, crewCsvReader& reader, CrewDataContext* dbData) {

	Logger::getRuleLogger()->info("saveRosterFlightToCsvStream startDtLoc={} endDtLoc={}",
		utcToUtcString(startDtLoc).c_str(), utcToUtcString(endDtLoc).c_str());

	shared_ptr<csvParser> rosterFlightParser = reader.getParser("RosterFlight");
	vector<void*> rosterFlightList;
	
	for (auto& crew : dbData->crewList) {
		vector<shared_ptr<RosterFlight>> list = dbData->rosterFlightMgr.get(crew->idCrew);
		for (auto& item : list) {
			if (flightIds.empty() || std::find(flightIds.begin(), flightIds.end(), item->fltId) != flightIds.end()){
				rosterFlightList.push_back(item.get());
			}
		}
	}
	
	reader.write(outfile, "RosterFlight", rosterFlightList, rosterFlightParser);

}

void savePairingDutySegmentToCsv(ofstream &outfile, vector<Pairing*>& pairingCopies, crewCsvReader& reader, CrewDataContext* dbData) {
	string dbg = "";
	dbg = "Pairing";
	shared_ptr<csvParser> pairingParser = reader.getParser("Pairing");
	vector<void*> csvPairingList;
	for (Pairing* p : pairingCopies) {
		csvPairingList.push_back(p);
	}
	reader.write(outfile, "Pairing", csvPairingList, pairingParser);
	//cleanupList(csvPairingList);

	dbg = "Duty";
	shared_ptr<csvParser> _dutyParser = reader.getParser("PairingDuty");
	vector<void*> csvDutyList;
	for (Pairing* p : pairingCopies) {
		for (Duty* d : p->getDutyVec()){
			csvDutyList.push_back(d);
		}
	}
	reader.write(outfile, "PairingDuty", csvDutyList, _dutyParser);
	//cleanupList(csvDutyList);
	dbg = "Segment";
	shared_ptr<csvParser> _segmentParser = reader.getParser("PairingSegment");
	vector<void*> csvSegList;
	for (Pairing* p : pairingCopies) {
		int segmentIndexInPairing = 0;
		for (Duty* d : p->getDutyVec()){
            // calculate the long transit status before output
            for (int i = 0; i < (int)d->getSegments().size(); ++i) {
            	if (i < d->getSegments().size() - 1) {
            		segmentParser::calculateLongTransitWithinDuty(d->getSegment(i), d->getSegment(i + 1));
            	}
            	// update the duty code in SQ
            	const auto& dutyCode = p->GetAssignedDutyCode().at(segmentIndexInPairing);
            	d->getSegment(i)->setDutyCode(dutyCode.GetDutyCode());
            	d->getSegment(i)->setDutyCodeType(DutyCode::GetMappedString(dutyCode.GetDutyType()));
                csvSegList.push_back(d->getSegment(i));
            	++segmentIndexInPairing;
            }
		}
	}
	reader.write(outfile, "PairingSegment", csvSegList, _segmentParser);
	
	//20190922 ain, mantis#6741, #5, change_flight流程 save保存dutyNode
	dbg = "PairingDutyNode";
//	fixPairingDuty(dbData); //修正Duty和PairingDutyNode可能错误
	shared_ptr<csvParser> dutyNodeParser = reader.getParser("PairingDutyNode");
	vector<void*> csvDutyNodeList;
	for (Pairing* p : pairingCopies) {
		for (Duty* d : p->getDutyVec()){
			for (shared_ptr<PairingDutyNode> node : d->pairingDutyNodes) {
				csvDutyNodeList.push_back(node.get());
			}
		}
	} 
	reader.write(outfile, "PairingDutyNode", csvDutyNodeList, dutyNodeParser);

	dbg = "PairingComposition";
	shared_ptr<csvParser> pcParser = reader.getParser("PairingComposition");
	vector<void*> csvPairingCompositionList = makePairingCompositions(dbData, pairingCopies);
	reader.write(outfile, "PairingComposition", csvPairingCompositionList, pcParser);
	ClearCsvReaderData(csvActivityComposition, csvPairingCompositionList);

	dbg = "FlightComposition";
	shared_ptr<csvParser> fcParser = reader.getParser("FlightComposition");
	vector<void*> csvFlightCompositionList;

	//if (dbData->getSystemParamValue("COMPOSITION_MODE", "NULL") == "FLIGHT") {
	//	// if using flight composition, pass through the original flight composition instead of calculated ones
	for (auto& flightComposition: dbData->originalFlightComposition) {
		csvFlightCompositionList.emplace_back(&flightComposition);
	}
	//} else {
	//	csvFlightCompositionList = makeFlightCompositions(dbData, pairingCopies);
	//}
	reader.write(outfile, "FlightComposition", csvFlightCompositionList, fcParser);

	csvPairingCompositionList.clear();
	csvFlightCompositionList.clear();
}

void savePairingDutySegmentToCsvForTO(ofstream &outfile, vector<Pairing*>& pairingCopies, crewCsvReader& reader, CrewDataContext* dbData) {
	string dbg = "";
	dbg = "Pairing";
	shared_ptr<csvParser> pairingParser = reader.getParser("Pairing");
	vector<void*> csvPairingList;
	for (Pairing* p : pairingCopies) {
		csvPairingList.push_back(p);
	}
	reader.write(outfile, "Pairing", csvPairingList, pairingParser);
	//cleanupList(csvPairingList);

	dbg = "Duty";
	shared_ptr<csvParser> _dutyParser = reader.getParser("PairingDuty");
	vector<void*> csvDutyList;
	for (Pairing* p : pairingCopies) {
		for (Duty* d : p->getDutyVec()){
			csvDutyList.push_back(d);
		}
	}
	reader.write(outfile, "PairingDuty", csvDutyList, _dutyParser);
	//cleanupList(csvDutyList);
	dbg = "Segment";
	shared_ptr<csvParser> _segmentParser = reader.getParser("PairingSegment");
	vector<void*> csvSegList;
	for (Pairing* p : pairingCopies) {
		int segmentIndexInPairing = 0;
		for (Duty* d : p->getDutyVec()){
            // calculate the long transit status before output
            for (int i = 0; i < (int)d->getSegments().size(); ++i) {
            	if (i < d->getSegments().size() - 1) {
            		segmentParser::calculateLongTransitWithinDuty(d->getSegment(i), d->getSegment(i + 1));
            	}
            	// update the duty code in SQ
            	const auto& dutyCode = p->GetAssignedDutyCode().at(segmentIndexInPairing);
            	d->getSegment(i)->setDutyCode(dutyCode.GetDutyCode());
            	d->getSegment(i)->setDutyCodeType(DutyCode::GetMappedString(dutyCode.GetDutyType()));
                csvSegList.push_back(d->getSegment(i));
            	++segmentIndexInPairing;
            }
		}
	}
	reader.write(outfile, "PairingSegment", csvSegList, _segmentParser);

	//20190922 ain, mantis#6741, #5, change_flight流程 save保存dutyNode
	dbg = "PairingDutyNode";
//	fixPairingDuty(dbData); //修正Duty和PairingDutyNode可能错误
	shared_ptr<csvParser> dutyNodeParser = reader.getParser("PairingDutyNode");
	vector<void*> csvDutyNodeList;
	for (Pairing* p : pairingCopies) {
		for (Duty* d : p->getDutyVec()){
			for (shared_ptr<PairingDutyNode> node : d->pairingDutyNodes) {
				csvDutyNodeList.push_back(node.get());
			}
		}
	}
	reader.write(outfile, "PairingDutyNode", csvDutyNodeList, dutyNodeParser);

	dbg = "PairingComposition";
	shared_ptr<csvParser> pcParser = reader.getParser("PairingComposition");
	vector<void*> csvPairingCompositionList = makePairingCompositions(dbData, pairingCopies);
	reader.write(outfile, "PairingComposition", csvPairingCompositionList, pcParser);

	// copied for TO
	dbg = "FlightComposition";
	shared_ptr<csvParser> fcParser = reader.getParser("FlightComposition");
	vector<void*> csvFlightCompositionList;
	csvFlightCompositionList = makeFlightCompositions(dbData, pairingCopies);
	reader.write(outfile, "FlightComposition", csvFlightCompositionList, fcParser);

	CLEANUP_CSV_LIST(csvPairingCompositionList);
}


void saveRosterToCsv(ofstream &outfile, crewCsvReader& reader, CrewDataContext* dbData, bool isSaveNewRoster) {
	shared_ptr<csvParser> rosterParser = reader.getParser("Roster");
	vector<void*> resultCopyList;
	for (auto& crew : dbData->crewList) {
		for (auto& roster : crew->rosterList) {
			if (roster->idscenario == dbData->scenarioId || roster->idscenario == 0) {
				ROSTER* copy = new ROSTER;
				copy->copy(roster.get());
				if (isSaveNewRoster) {
					if (copy->idscenario == 0) {				//save roster from 0 as current scenario
						copy->idscenario = dbData->scenarioId;
						copy->source = "PA";
						copy->rosterId = dbData->tempIdGenerator--;
					}
				}
				copy->tmst = time(0);
				resultCopyList.push_back(copy);
			}
		}
	}
	reader.write(outfile, "Roster", resultCopyList, rosterParser);
	
	//delete & clear copies
	for (void* ptr : resultCopyList) {
		ROSTER* copy = (ROSTER*)ptr;
		delete copy;
	}
	resultCopyList.clear();
}



void saveRosterGroundTagToCsv(ofstream& outfile, crewCsvReader& reader, CrewDataContext* dbData) {
	shared_ptr<csvParser> rosterParser = reader.getParser("Roster");
	vector<void*> resultCopyList;
	for (auto& crew : dbData->crewList) {
		for (auto& roster : crew->rosterList) {
			if (!roster->pairing) {
				ROSTER* copy = new ROSTER;
				copy->copy(roster.get());
				copy->tmst = time(0);
				resultCopyList.push_back(copy);
			}
		}
	}
	reader.write(outfile, "Roster", resultCopyList, rosterParser);

	//delete & clear copies
	for (void* ptr : resultCopyList) {
		ROSTER* copy = (ROSTER*)ptr;
		delete copy;
	}
	resultCopyList.clear();
}

void saveBiddingResultsToCsv(ofstream &outfile, crewCsvReader &reader, CrewDataContext *dbData) {
    shared_ptr<csvParser> biddingResultParser = reader.getParser("BiddingResult");
    shared_ptr<csvParser> biddingResultDetailParser = reader.getParser("BiddingResultDetail");
    vector<void *> resultCopyList;
    vector<void *> resultDetailCopyList;
    for (auto &result: dbData->biddingResults) {
        if (result->satisfied) {
            resultCopyList.push_back(result.get());
            for (auto &detail: result->details) {
                resultDetailCopyList.push_back(detail.get());
            }
        }
    }
    reader.write(outfile, "BiddingResult", resultCopyList, biddingResultParser);
    reader.write(outfile, "BiddingResultDetail", resultDetailCopyList, biddingResultDetailParser);
}

//填充 segment.date/ depFromDayBegin/ arvFrmoDayBegin
void fillSegmentDateField(Segment* seg) {

	string segDate = seg->getDate();//mantis#5628
	if (segDate == "")
		seg->setDate(utcToUtcDtString(seg->getStartTimeLocSch()));
	tm m = { 0 };
	time_t dep = seg->getStartTimeLocSch();

#ifdef _WIN32
	_gmtime64_s(&m, &dep);
#else
	gmtime_r(&dep, &m);
#endif

	seg->setDepMinutesFromDayBegin(m.tm_hour * 60 + m.tm_min);
	seg->setDayInt(m.tm_mday);
	time_t arv = seg->getEndTimeLocSch();

#ifdef _WIN32
	_gmtime64_s(&m, &arv);
#else
	gmtime_r(&arv, &m);
#endif

	seg->setArrMinutesFromDayBegin(m.tm_hour * 60 + m.tm_min);
}

//填充 segment.Loc时间字段
void fillSegmentLocTimeField(Segment* seg, map<string, DBAirport*>& airportCodeMap, CrewDataContext* dbData) {

	auto iterDepStation = airportCodeMap.find(seg->getDepStationRead());
	if (iterDepStation == airportCodeMap.end()) {
		Logger::getRuleLogger()->error("ERROR: invalid data, AirportCodeMap do not exist airport {}, flightId:{}", seg->getDepStationRead(), seg->getDBId());
		string defaultBase = dbData->getSystemParamValue("SYSTEM_DISPLAY_BASE", "");
		if (!defaultBase.empty()) {
			iterDepStation = airportCodeMap.find(defaultBase);
		}
	}
	auto iterArrStation = airportCodeMap.find(seg->getArrStationRead());
	if (iterArrStation == airportCodeMap.end()) {
		Logger::getRuleLogger()->error("ERROR: invalid data, AirportCodeMap do not exist airport {}, flightId:{}", seg->getArrStationRead(), seg->getDBId());
		string defaultBase = dbData->getSystemParamValue("SYSTEM_DISPLAY_BASE", "");
		if (!defaultBase.empty()) {
			iterArrStation = airportCodeMap.find(defaultBase);
		}
	}
    const char* depZoneId = (iterDepStation == airportCodeMap.end()) ? "Asia/Shanghai" : iterDepStation->second->zoneId;
    const char* arrZoneId = (iterArrStation == airportCodeMap.end()) ? "Asia/Shanghai" : iterArrStation->second->zoneId;

	seg->setStartTimeLocSch(TimezoneUtils::GetLocalTime(seg->getStartTimeUtcSch(), depZoneId));
	seg->setEstDepDtLoc(TimezoneUtils::GetLocalTime(seg->getEstDepDtUtc(), depZoneId));
	seg->setStartTimeLocAct(TimezoneUtils::GetLocalTime(seg->getStartTimeUtcAct(), depZoneId));

	seg->setEndTimeLocSch(TimezoneUtils::GetLocalTime(seg->getEndTimeUtcSch(), arrZoneId));
	seg->setEstArvDtLoc(TimezoneUtils::GetLocalTime(seg->getEstArvDtUtc(), arrZoneId));
	seg->setEndTimeLocAct(TimezoneUtils::GetLocalTime(seg->getEndTimeUtcAct(), arrZoneId));

}

//填充 Pairing/Duty 2.0字段
void fillPairingAndDutyField(Pairing* pairing, map<string, DBAirport*>& airportCodeMap) {

	/*if (pairing->getLastDuty()->getLastSegment()) {
		pairing->setEndArp(pairing->getLastDuty()->getLastSegment()->getArrStation());
	}*/
	for (auto duty : pairing->getDutyVec()) {
		duty->setStartTimeUtcSch(duty->getFirstBreif()->getStartUtc());
		duty->setStartTime(duty->getFirstBreif()->getStartLoc());
		duty->setStartTimeUtcAct(duty->getFirstBreif()->getStartUtc());
		duty->setStartTimeLocAct(duty->getFirstBreif()->getStartLoc());

		duty->setEndTimeUtcSch(duty->getLastDebrief()->getEndUtc());
		duty->setEndTime(duty->getLastDebrief()->getEndLoc());
		duty->setEndTimeUtcAct(duty->getLastDebrief()->getEndUtc());
		duty->setEndTimeLocAct(duty->getLastDebrief()->getEndLoc());
		if (duty->getFirstSegment()) {
			duty->setDepartureStation(duty->getFirstSegment()->getDepStation());
		}
		if (duty->getLastSegment()) {
			duty->setArrStation(duty->getLastSegment()->getArrStation());
		}
		duty->setActualPickupMin(static_cast<long>(duty->getFirstPickup()->getEndUtc() - duty->getFirstPickup()->getStartUtc()) / 60);
		duty->setActualBriefMin(static_cast<long>(duty->getFirstBreif()->getEndUtc() - duty->getFirstBreif()->getStartUtc()) / 60);
		duty->setActualDebriefMin(static_cast<long>(duty->getLastDebrief()->getEndUtc() - duty->getLastDebrief()->getStartUtc()) / 60);
		duty->setActualDropoffMin(static_cast<long>(duty->getLastDropoff()->getEndUtc() - duty->getLastDropoff()->getStartUtc()) / 60);
	}
	auto dutyVec = pairing->getDutyVec();
	std::stable_sort(dutyVec.begin(), dutyVec.end(), [](Duty* l, Duty* r) {return l->getUtcStartTime() < r->getUtcStartTime(); });
	pairing->setDutyVec(dutyVec);
	pairing->setStartTimeLocSch(pairing->getFirstDuty()->getStartTimeLocSch());
	pairing->setStartTimeUtcAct(pairing->getFirstDuty()->getStartTimeUtcAct());
	pairing->setStartTimeLocAct(pairing->getFirstDuty()->getStartTimeLocAct());
    pairing->setEndTimeLocSch(pairing->getLastDuty()->getEndTimeLocSch());
	pairing->setEndTimeUtcAct(pairing->getLastDuty()->getEndTimeUtcAct());
	pairing->setEndTimeLocAct(pairing->getLastDuty()->getEndTimeLocAct());
	if (pairing->getLastDuty()->getLastSegment()) { //move this setter after sorting the duties
		pairing->setEndArp(pairing->getLastDuty()->getLastSegment()->getArrStation());
	}
}

//因seg/flt表结构不同, 按flt填充对应seg.blk/onward/tail/domIntType
void copyFlightFieldToSegment(Segment* flt, Segment* seg) {
	if (!seg || !flt) {
		Logger::getRuleLogger()->error("invalid param, copyFlightFieldToSegment fail");
		return;
	}
	seg->setBlkTime(flt->getBlkMinutes() * 60);
	seg->setSchBlkTime(flt->getSchBlkMinutes() * 60);
	seg->setNextLegNo(flt->getNextLegNo());
	seg->setRegister(flt->getRegister());
	seg->setTailNum(flt->getTailNum());
	seg->setFltType(flt->getFltType());
	seg->setServiceType(flt->getServiceType());
	seg->setDomIntType(flt->getDomIntType());
}

static void populateNonOperatingFlightServiceType(const unordered_map<long long, SharedPtr<Segment>>& flightIdMap,
	vector<Segment*>& segments) {
	for (auto* seg : segments) {
		if (seg == nullptr || seg->getDBId() == 0 || seg->getIsOperating()) {
			continue;
		}

		auto flightIt = flightIdMap.find(seg->getDBId());
		if (flightIt == flightIdMap.end() || flightIt->second == nullptr) {
			continue;
		}

		const auto& flight = flightIt->second;
		if (seg->getServiceType().empty()) {
			seg->setServiceType(flight->getServiceType());
		}
		if (seg->getFltType().empty()) {
			seg->setFltType(flight->getFltType());
		}
	}
}

//根据 commuteSchedule创建 commuteSegment对象
int makeSegmentByCommuteSchedule(csvCommuteSchedule * commute, string& airline, time_t startUtc, time_t endUtc, long long startOfBusId, unordered_map<string, int> &airportUtcOffsetMap, unordered_map<string, daylight_saving> &daylightSavingMap, vector<Segment*>& result) {
	int              ret = 0;
	int              i = 0;
	int              days = 0;
	time_t           ferryStartUtc = startUtc;
	time_t           ferryEndUtc = endUtc;
	int              depHH = 0;
	int              depMM = 0;
	int              depTimeOfDay = 0;
	int              arrTimeOfDay = 0;
	time_t             dayStart = 0;
	time_t             segDepUtc = 0;
	time_t             segArrUtc = 0;
	time_t             segDepLoc = 0;
	time_t             segArrLoc = 0;
	time_t             tmpTime = 0;
	time_t			 lastModify = 0;

	if (daylightSavingMap.empty()) {
		//Logger::getRuleLogger()->info("WARN: daylightSavingMap is empty");
	}

	if (commute->effDt > startUtc) {
		ferryStartUtc = commute->effDt;
	}
	if (commute->expDt != 0 && commute->expDt != -1 && commute->expDt < endUtc) {
		ferryEndUtc = commute->expDt;
	}

	// 输入commute schedule是本地时间，需要转换为utc
	depHH = commute->depTm / 60;
	depMM = commute->depTm % 60;
	auto arrHH = commute->arvTm / 60;
	auto arrMM = commute->arvTm % 60;
	depTimeOfDay = depHH * 3600 + depMM * 60;
	arrTimeOfDay = arrHH * 3600 + arrMM * 60;

	days = getDaysByDuration(ferryStartUtc, ferryEndUtc);
	for (i = 0; i < days; i++) {
		tmpTime = ferryStartUtc + 24 * 3600 * i;
		dayStart = getStartTimeOfDay(tmpTime);

		// 输入commute schedule是本地时间，需要转换为utc
		segDepLoc = dayStart + depTimeOfDay;
		segArrLoc = dayStart + arrTimeOfDay;
		string depSta = commute->depSta;
		string arrSta = commute->arvSta;

		auto depOffset = airportUtcOffsetMap.at(depSta);
		auto arrOffset = airportUtcOffsetMap.at(arrSta);

		// TODO 使用新 time zone utility
		segDepUtc = segDepLoc - depOffset * 60;
		segArrUtc = segArrLoc - arrOffset * 60;
		// 考虑跨零点的情况
		const int SecendsInDay = 3600 * 24;
		if (segArrUtc < segDepUtc) {
			segArrUtc += SecendsInDay;
			segArrLoc += SecendsInDay;
		}
		//segDepLoc = utcToAirportLoc(depSta, segDepUtc, airportUtcOffsetMap, daylightSavingMap);
		//segArrLoc = utcToAirportLoc(arrSta, segArrUtc, airportUtcOffsetMap, daylightSavingMap);

		string tempString = "NULL";
		string fleetCode = commute->commuteType;
		long long busId = startOfBusId++;
		//long long busDBId = commute->id;

		Segment * segBus = new Segment(
			busId, segDepLoc, segArrLoc, commute->depSta,
			fleetCode, commute->arvSta, fleetCode, commute->durationMin * 60,
			100, 100, 100, 100, 100, 100,
			100, 100, 100, 100, 100, 100,
			commute->commuteType, tempString, fleetCode, tempString, false, lastModify, commute->flightFlag, false);

		//segBus->setDBId(busDBId); // added by ZZM, set bus DBId, 2019.01.15,Ferry的DBID在数据库中必须为0
		segBus->setUtcStartTime(segDepUtc);
		segBus->setUtcEndTime(segArrUtc);
		segBus->setStartTimeUtcAct(segDepUtc);
		segBus->setEndTimeUtcAct(segArrUtc);
		segBus->setStartTimeLocAct(segDepLoc);
		segBus->setEndTimeLocAct(segArrLoc);

		segBus->setDate(utcToUtcDtString(segDepLoc));

		result.push_back(segBus);
	}
//CLEANUP:
	return ret;
}


DBRule makeMixRuleByCsv(DBRule* originObj, long long ruleSet, csvRuleParam * item) {

	DBRule rule;//从 ruleIdMap对象拷贝复制
	rule.copyFrom(originObj);
	rule.phase = item->phaseId;
	rule.idRuleSet = ruleSet;
	rule.tableNum = 0;
	rule.rowNum = 0;

	vector<string> headers;
	vector<string> values;
	split(item->paramNames, ',', headers);
	split(item->paramValues, ',', values);
	for (size_t j = 0; j < headers.size(); j++) {
		rule.params[headers[j]] = values[j];
	}
	return rule;
}

DBRule makeTableRuleByCsv(map<string, vector<string>>& ruleIdHeaderMap, DBRule* originObj, long long ruleSet, csvRuleParam * item) {

	vector<string> values;
	split(item->paramValues, ',', values);
	char tableStr[100] = { 0 };
	char rowStr[100] = { 0 };
	DBRule rule;//从 ruleIdMap对象拷贝复制
	rule.copyFrom(originObj);
	rule.phase = item->phaseId;
	rule.idRuleSet = ruleSet;
	rule.idRuleParam = item->id;

	getTableNumFromNameStr(item->paramNames.c_str(), tableStr, sizeof(tableStr));
	getRowNumFromNameStr(item->paramNames.c_str(), rowStr, sizeof(rowStr));
	//mantis#2325, csv ruleParam.table/rowNum
	rule.tableNum = retriveIntFromStr(tableStr, 0);
	rule.rowNum = retriveIntFromStr(rowStr, 0);
	stringstream key;
	key << item->ruleId << tableStr;
	if (ruleIdHeaderMap.find(key.str()) == ruleIdHeaderMap.end()) {
		Logger::getRuleLogger()->error("invalid data, no header recode found for rule_parameter={}", item->ruleId);
		//throw "invalid data, no header recode found for rule_parameter";
		return rule;
	}
	vector<string> headers = ruleIdHeaderMap[key.str()];
	if (headers.size() != values.size()) {
		Logger::getRuleLogger()->error("invalid data, paramNames and paramValues not match on rule={}, id={}", item->ruleId, item->id);
		//throw "invalid data, paramNames and paramValues not match on rule";
		return rule;
	}

	for (size_t j = 0; j < headers.size(); j++) {
		rule.params[headers[j]] = values[j]; //mantis#2339, ruleParam.name大写
	}
	return rule;
}


//从Names字段获取table编号：table1，table2...
void getTableNumFromNameStr(const char * names, char * buf, int bufsize) {
	char * p = NULL;
	char namesBuf[20 + 1] = { 0 };
	strncpy(namesBuf, names, 20);
	//strToupper(namesBuf, sizeof(namesBuf));


	p = (char*)strstr(namesBuf, "HEADER");
	if (p == NULL)
		p = (char*)strstr(namesBuf, "Header");
	if (p == NULL)
		p = (char*)strstr(namesBuf, "ROW");
	if (p == NULL)
		p = (char*)strstr(namesBuf, "Row");
	if (p == NULL)
		return;
	int size = static_cast<int>(p - namesBuf);
	if (size > bufsize)
		size = bufsize - 1;
	memset(buf, 0, bufsize);
	strncpy(buf, namesBuf, size);
}

//从Names字段获取row编号：row1，row2...
void getRowNumFromNameStr(const char * names, char * buf, int bufsize) {
	char * p = NULL;
	char namesBuf[20 + 1] = { 0 };
	strncpy(namesBuf, names, 20);
	//strToupper(namesBuf, sizeof(namesBuf));

	p = (char*)strstr(namesBuf, "ROW");
	if (p == NULL)
		p = (char*)strstr(namesBuf, "Row");
	if (p == NULL)
		return;
	memset(buf, 0, bufsize);
	strncpy(buf, p, bufsize);
}

//将ruleList ruleParameter按csv格式存入csv文件
void saveCsvRuleParameter(crewCsvReader& reader, ofstream& outfile, string name, vector<DBRule>& list) {
	shared_ptr<csvParser> csvParser = reader.getParser(name);

	vector<void*> csvList;
	map<string, string> tableHeaderMap;
	map<string, bool> tableHeaderOutputed;
	for (auto& item : list) {
		stringstream key;
		stringstream header;
		key << item.idRule << "::" << item.tableNum;
		bool first = true;
		if (tableHeaderMap.find(key.str()) == tableHeaderMap.end()) {
			for (auto& param : item.params) {
				if (first)
					first = false;
				else
					header << ",";
				header << param.first;
			}
			tableHeaderMap[key.str()] = header.str();
		}
	}
	for (auto& item : list) {
		stringstream key;
		key << item.idRule << "::" << item.tableNum;

		char tableNumStr[20] = { 0 };
		if (0 == strcmp(item.storeType, "MultiTable")) {
			// For Linux
			sprintf(tableNumStr, "%d", item.tableNum);
			// For Windows
			//_itoa(item.tableNum, tableNumStr, 10);
		}

		//table rule增加 header row
		if (
			(0 == strcmp(item.storeType, RULE_STORE_TYPE_MULTI_TABLE)
			|| 0 == strcmp(item.storeType, RULE_STORE_TYPE_TALBE))
			&& tableHeaderOutputed.find(key.str()) == tableHeaderOutputed.end()) {
			tableHeaderOutputed[key.str()] = true;
			stringstream headerStr;
			headerStr << "table" << tableNumStr << "Header";
			csvRuleParam * header = new csvRuleParam;
			header->id = 0;
			header->ruleId = item.idRule;
			header->phaseId = 1;//planning
			header->paramNames = headerStr.str();
			header->paramValues = tableHeaderMap[key.str()];
			csvList.push_back(header);
		}

		//param_names: 若type=Mix则names=header，否则names=tableRow
		stringstream names;
		if ((0 == strcmp(item.storeType, RULE_STORE_TYPE_MULTI_TABLE)
			|| 0 == strcmp(item.storeType, RULE_STORE_TYPE_TALBE)))
			names << "table" << tableNumStr << "Row" << item.rowNum;
		else
			names << tableHeaderMap[key.str()];

		stringstream values;
		bool first = true;
		for (auto& param : item.params) {
			if (first)
				first = false;
			else
				values << ",";
			values << param.second;
		}
		csvRuleParam * copy = new csvRuleParam;
		copy->id = 0;
		copy->ruleId = item.idRule;
		copy->phaseId = 1;//planning
		copy->paramNames = names.str();
		copy->paramValues = values.str();
		csvList.push_back(copy);
	}
	reader.write(outfile, name, csvList, csvParser);
	CLEANUP_CSV_LIST(csvList);
}
