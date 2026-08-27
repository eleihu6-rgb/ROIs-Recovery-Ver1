#include <fstream>
#include <vector>
#include <algorithm>

#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "TestDBFunc.h"
#include "UtilFunc.h"
#include "csv/csv_reader.h"
#include "csv/csv_impl.h"
#include "PairingCompositionCalculator.h"
#include "PairingAttrCalculator.h"
#include "CsvStreamUtil.h"
#include "PairingUtil.h"
#include "StringUtil.h"
#include "CustomBiz/CustomBiz.h"
#include "Log/Logger.h"

double getTotalBLHFromSegments(vector<Segment>& list);
bool isRuleExist(vector<DBRule>& list, int function);
void resetPairingStartByPickup(vector<Pairing*>& list);

int CrewDataContext::loadDataPoCsv(char * filepath) {
	int errorCode = 0;
	size_t i = 0;
	size_t j = 0;
	string dbg = "";
	ofstream errLog;
	vector<string> leadinInfo;
	//map<long long, string> attributeIdMap;
	try {
		Logger::getRuleLogger()->info("loadDataCsv start");
		errLog.open("err.log");

		//
		vector<string> dummyAttr = { "" };
		//FlightAttribute::init(dummyAttr);


		//read csv
		crewCsvReader reader;

		//先初始化 Attribute, 避免构造Pairing等对象时出错
		reader.readCsvAttribute(filepath);
		dbg = "Attribute";
		{
			vector<string> attributeNames;
			vector<void*> csvAttributeList = reader.datas["Attribute"];
			for (i = 0; i < csvAttributeList.size(); i++) {
				csvAttribute* obj = (csvAttribute*)csvAttributeList[i];
				attributeNames.push_back(obj->code);
				//attributeIdMap[obj->id] = obj->code;
				ATTRIBUTE item;
				item.id = obj->id;
				item.airline = obj->airline;
				item.code = obj->code;
				item.type = obj->type;
				item.operation = obj->operation;
				this->attributeIdMap[item.id] = item;
			}
			FlightAttribute::init(attributeNames);
		}
		dbg = "Tag";
		{
			vector<void*> csvTagCategorys = reader.datas["TagCategory"];
			vector<void*> csvTagGroups = reader.datas["TagGroup"];
			vector<void*> csvTagFlights = reader.datas["TagFlight"];
			vector<void*> csvTagDutys = reader.datas["TagDuty"];
			vector<void*> csvTagPairings = reader.datas["TagPairing"];
			vector<void*> csvTagFlightCompositions = reader.datas["TagFlightComposition"];
			vector<void*> csvTagRosterGround = reader.datas["TagRosterGround"];

			for (std::size_t i = 0; i < csvTagCategorys.size(); i++) {
				SharedPtr<TAG_CATEGORY> item(new TAG_CATEGORY(*((TAG_CATEGORY*)csvTagCategorys[i])));

				this->tagCategoryList.push_back(item);
			}
			for (std::size_t i = 0; i < csvTagGroups.size(); i++) {
				SharedPtr<TAG_GROUP> item(new TAG_GROUP(*((TAG_GROUP*)csvTagGroups[i])));
				if (item->type == "TABLE") {
					this->tagGroupTableMap[item->parentId].push_back(item);
					continue;
				}
				if (item->parentId == 0) {
					//SharedPtr<TAG> tag;
					TAG * tag = new TAG;
					tag->id = item->id;
					tag->condition = item->condition;
					tag->tagCategoryId = item->tagCategoryId;
					tag->type = item->type;
					tag->idx = item->idx;
					tag->level = item->level;
					tag->parentId = llToStr(item->parentId);
					this->tagGroupMap[tag->id] = tag;
					continue;
				}
				if (this->tagGroupMap.find(item->parentId) != this->tagGroupMap.end()) {
					this->tagGroupMap[item->parentId]->groups.push_back(item);
				}

			}
			for (std::size_t i = 0; i < csvTagFlights.size(); i++) {
				SharedPtr<TAG_FLIGHT> item(new TAG_FLIGHT(*((TAG_FLIGHT*)csvTagFlights[i])));

				this->tagFlightGroupMap[item->tagGroupId].push_back(item);
			}
			for (std::size_t i = 0; i < csvTagDutys.size(); i++) {
				SharedPtr<TAG_DUTY> item(new TAG_DUTY(*((TAG_DUTY*)csvTagDutys[i])));

				this->tagDutyGroupMap[item->tagGroupId].push_back(item);
			}
			for (std::size_t i = 0; i < csvTagPairings.size(); i++) {
				SharedPtr<TAG_PAIRING> item(new TAG_PAIRING(*((TAG_PAIRING*)csvTagPairings[i])));

				this->tagPairingGroupMap[item->tagGroupId].push_back(item);
			}
			for (std::size_t i = 0; i < csvTagFlightCompositions.size(); i++) {
				SharedPtr<TAG_FLIGHT_COMPOSITION> item(new TAG_FLIGHT_COMPOSITION(*((TAG_FLIGHT_COMPOSITION*)csvTagFlightCompositions[i])));

				this->tagFlightCompositionGroupMap[item->tagGroupId].push_back(item);
			}
			for (std::size_t i = 0; i < csvTagRosterGround.size(); i++) {
				SharedPtr<TAG_ROSTER_GROUND> item(new TAG_ROSTER_GROUND(*((TAG_ROSTER_GROUND*)csvTagRosterGround[i])));

				this->tagRosterGroundGroupMap[item->tagGroupId].push_back(item);
			}
		}
		dbg = "reader.readMutiTableCsv";
		reader.readMutiTableCsv(filepath);
		this->version = reader.getVersion();
		Logger::getRuleLogger()->debug("read csv split_cost={} ms", (split_cost / 1000000));

		dbg = "systemParameter";
		//dataCtx.systemParameters
		vector<void*> csvSysParmList = reader.datas["SystemParameter"];
		for (i = 0; i < csvSysParmList.size(); i++) {
			csvSystemParam* obj = (csvSystemParam*)csvSysParmList[i];
			this->systemParamMap[string(obj->parmName)] = string(obj->parmValue);
		}

		//** 注 **
		//将 csv读取对象整理后放入 dbData
		//因 csvReader中内容需要被释放，不允许将 csvReader中原始对象加入 dbData，只能拷贝复制
		dbg = "base/rank/fleet/airport/rankActing";

		vector<void*> csvBaseList = reader.datas["Base"];
		map<long long, BASE> baseObjMap;
		for (i = 0; i < csvBaseList.size(); i++) {
			BASE base = (*(BASE*)csvBaseList[i]);
			baseObjMap[base.baseId] = base;
			this->baseList.push_back(base);//20180730 ain
		}
		//rank
		vector<void*> rankList = reader.datas["Rank"];
		map<long long, string> rankIdMap;
		map<long long, RANK> rankObjMap;
		for (i = 0; i < rankList.size(); i++) {
			RANK rank = (*(RANK*)rankList[i]);
			this->rankList.push_back(rank);
			this->rankMap.insert(pair<string, RANK>(rank.rank, rank));
			rankIdMap[rank.rankId] = rank.rank;
			rankObjMap[rank.rankId] = rank;
		}
		//fleet
		vector<void*> fleetList = reader.datas["Fleet"];
		map<long long, string> fleetIdMap;
		for (i = 0; i < fleetList.size(); i++) {
			FLEET fleet = (*(FLEET*)fleetList[i]);
			fleetIdMap[fleet.fleetId] = fleet.fleet;
			this->fleetMap.insert(pair<string, FLEET>(fleet.fleet, fleet));
			this->fleetList.push_back(fleet);
		}
		//airport
		vector<void*> csvAirportList = reader.datas["Airport"];
		for (i = 0; i < csvAirportList.size(); i++) {
			DBAirport copy(*(DBAirport*)csvAirportList[i]);
			this->airportList.push_back(copy);
		}
		for (i = 0; i < this->airportList.size(); i++) {
			//airportCodeMap
			string airportCode = airportList[i].airport;
			this->airportCodeMap[airportCode] = &airportList[i];
			//airpot utc offset
			this->airportUtcOffsetMap[airportCode] = airportList[i].utcOffsetMinutes;
            this->airportZoneIdMap[airportCode] = airportList[i].zoneId;
        }
		//rankActing
		vector<void*> csvRankActingList = reader.datas["RankActing"];
		this->rankActingList;
		for (i = 0; i < csvRankActingList.size(); i++) {
			DBRankActing item;
			csvRankActing * csvData = (csvRankActing*)csvRankActingList[i];
			item.tid = csvData->id;
			item.airline = csvData->airline;
			item.activeRank = csvData->activeRank;
			item.actingRank = csvData->actingRank;
			item.qual = csvData->qual;
			this->rankActingList.push_back(item);
		}
		//briefing
		vector<void*> csvBriefList = reader.datas["Briefing"];
		for (i = 0; i < csvBriefList.size(); i++) {
			SharedPtr<Briefing> item(new Briefing(*((Briefing*)csvBriefList[i])));
			this->briefingNameMap[item->airline + item->airport] = item;
		}
		//crew base
		vector<void*>& csvCrewBaseList = reader.datas["CrewBase"];
		for (i = 0; i < csvCrewBaseList.size(); i++) {
			SharedPtr<CREW_BASE> copy(new CREW_BASE(*(CREW_BASE*)csvCrewBaseList[i]));
			this->crewBases.push_back(copy);
		}
		ClearCsvReaderData(CREW_BASE, csvCrewBaseList);
		dbg = "roster";
		vector<void*> &csvRosterList = reader.datas["Roster"];
		for (i = 0; i < csvRosterList.size(); i++) {
			SharedPtr<ROSTER> copy = shared_ptr<ROSTER>(new ROSTER(*(ROSTER*)csvRosterList[i]));
			//20180402 ain, mantis#3079, 补齐src=PA
			if (copy->idscenario == 0 && this->scenarioId != 0) {
				copy->source = "PA";
				copy->sourceType = ROSTER_SOURCE_PRE_ASSIGN;
			}
			copy->needRuleCheck = false;
			this->rostersForPO.push_back(copy);
		}
		//ROSTER数量最多，提前释放
		ClearCsvReaderData(ROSTER, csvRosterList);
		Logger::getRuleLogger()->debug("After load Roster mem={} MB", (getProcessCurrentMem() / (1024 * 1024)));

		dbg = "composition/composition_rank";
		map<long long, shared_ptr<map<string, int>>> compositionRankValueMap;
		loadCompositionRank(compositionRankValueMap, rankIdMap, reader, this);		

		dbg = "scenario";
		map<long long, ATTRIBUTE*> tmpAttrMap = map<long long, ATTRIBUTE*>();
		map<long long, SharedPtr<TAG_CATEGORY>> tmpTagMap = map<long long, SharedPtr<TAG_CATEGORY>>();
		loadWorksetAndScenario(this, reader, baseObjMap, rankObjMap, fleetIdMap, tmpAttrMap, tmpTagMap);

		//20180619 ain, mantis#3504, loadDataPoCsv补齐 assignment/group/map解析
		dbg = "assignment/assignmentGroup/assignmentGroupMap/assignmentToRule8014";
		loadAssignmentAndGroup(this, reader);

		dbg = "rule/ruleParam";
		loadRule(this, reader);

		dbg = "cqf";
		loadCqf(this, reader);

		dbg = "PortQualReqmnt";
		loadPortQualReqmnt(this, reader);

		dbg = "leadin";
		{
			vector<void*> leadinScenarioList = reader.datas["Scenario(LEADIN)"];
			if (leadinScenarioList.size() > 0) {
				this->leadinScenarioId = ((Scenario*)leadinScenarioList[0])->scenarioId;
			}
		}

		dbg = "flight/flightComposition/flightAttribute";
		loadFlightAndCompAndAttr(this->flightIdMap, this->flightList, reader, this);

		//构建机场距离表
		makeAirportDistanceMap();

		dbg = "DutyCodeTypeComp";
		vector<void*> csvDutyCodeTypeCompList = reader.datas["DutyCodeTypeComp"];
		for (i = 0; i < csvDutyCodeTypeCompList.size(); i++) {
			DutyCodeTypeComp* obj = static_cast<DutyCodeTypeComp*>(csvDutyCodeTypeCompList[i]);
			shared_ptr<DutyCodeTypeComp> dutyCodeTypeComp = std::make_shared<DutyCodeTypeComp>(*(DutyCodeTypeComp*)csvDutyCodeTypeCompList[i]);
			this->dutyCodeTypeCompList.emplace_back(dutyCodeTypeComp);
		}

		dbg = "DutyCodeLogic";
		vector<void*> csvDutyCodeLogicList = reader.datas["DutyCodeLogic"];
		for (i = 0; i < csvDutyCodeLogicList.size(); i++) {
			DutyCodeLogic* obj = static_cast<DutyCodeLogic*>(csvDutyCodeLogicList[i]);
			shared_ptr<DutyCodeLogic> dutyCodeLogic = std::make_shared<DutyCodeLogic>(*(DutyCodeLogic*)csvDutyCodeLogicList[i]);
			this->dutyCodeLogicList.emplace_back(dutyCodeLogic);
		}
		this->dutyCodeLogicMap = makeDutyCodeLogicMap(this->dutyCodeLogicList);

		// init duty code
		initDutyCodeAssignment();

		dbg = "pairing/duty/segment";
		loadPairingDutySegment(pairingIdMap, flightIdMap, compositionRankValueMap, reader, this);
		for (auto& it : pairingIdMap) {
			this->pairingListBeforeRun.push_back(it.second);
		}
		stable_sort(pairingListBeforeRun.begin(), pairingListBeforeRun.end(), [](Pairing* a, Pairing* b) -> bool {
			return a->getDbId() > b->getDbId();
		});

		{
			vector<Pairing*> leadinPairings;
			//处理Map和leadin Pairing, Map Pairing 需要Lock住才被当做leadinPairing
			//this->pairingList: preference='L' -> Lock
			for (auto it = pairingIdMap.begin(); it != pairingIdMap.end(); it++) {
				long long pairingId = it->first;
				pairingParser* parser = (pairingParser*)reader.getParser("Pairing").get();
				if (parser->pairingPreferenceMap.find(pairingId) != parser->pairingPreferenceMap.end()
					&& parser->pairingPreferenceMap[pairingId] == "L") {
					Pairing * copy = it->second;
					this->pairingList.push_back(copy);
				}
			}

			//leadin pairings
			
			for (auto it = pairingIdMap.begin(); it != pairingIdMap.end(); it++) {
//				if (it->second->getScenarioId() == this->leadinScenarioId) {
					leadinPairings.push_back(it->second);
					//将leadin的Pairing加入到pairingList集合中，为了解决leadin还出现在looseSegment中的问题
					this->pairingListLeadin.push_back(it->second);
//				}
			}

			////leadin dhd: fix cqf 4003 param
			//int leadinDhdCount = 0;
			//for (Pairing* p : leadinPairings) {
			//	for (Duty* d : p->getDutyVec()) {
			//		for (Segment* s : d->getSegments()) {
			//			if (s->getAssignment() == "DHD" && s->getStartTimeLocal() >= this->startUtc)
			//				leadinDhdCount++;
			//		}
			//	}
			//}
			//fixDhdLimitByLeadin(this->cqfList2, leadinDhdCount, this->startUtc, this->endUtc);

			//leadin occupy
			for (Pairing* p : leadinPairings) {
				for (Duty* d : p->getDutyVec()) {
					for (Segment* s : d->getSegments()) {
						if (s->getAssignment() == "FLY" && s->getStartTimeLocal() >= this->startUtc) {
							string base = p->getBase();
							if (this->leadinOccupy.find(base) == this->leadinOccupy.end()) {
								this->leadinOccupy.insert(make_pair(base, map<string, double>()));
							}
							for (auto& entry : p->getComplements()) {
								string rank = entry.first;
								int value = entry.second;
								this->leadinOccupy[base][rank] += value * s->getBlkTime() / 60; //minutes
							}
						}
					}
				}
			}

			//leadin info
			for (Pairing* p : leadinPairings) {
				for (Duty* d : p->getDutyVec()) {
					for (Segment* s : d->getSegments()) {
						if (s->getAssignment() == "FLY" && s->getStartTimeLocal() >= this->startUtc) {
							composition_rank& rankvalue = this->compositionRankMap[p->getCompositionId()];
							string line = makeLeadinInfo(p->getDbId(), p->getCompositionId(), s->getDBId(), compositionRankMap);
							leadinInfo.push_back(line);
						}
					}
				}
			}


			//inputFlights.fillComposition: compute by leadin/lock pairings
			vector<Pairing*> pairingsForFlightFillComposition;
			pairingsForFlightFillComposition.insert(pairingsForFlightFillComposition.end(), leadinPairings.begin(), leadinPairings.end());
 			pairingsForFlightFillComposition.insert(pairingsForFlightFillComposition.end(), pairingList.begin(), pairingList.end());
			//for (auto& it : pairingIdMap) {
			//Pairing * p = it.second;
			for (Pairing* p : pairingsForFlightFillComposition) {
				for (Duty* d : p->getDutyVec()) {
					for (Segment* s : d->getSegments()) {
						if (flightIdMap.find(s->getDBId()) != flightIdMap.end()) {
							auto flt = flightIdMap[s->getDBId()];
							//20180726 ain, mantis#3701, 修正错误的使用原始航班对象 flt->isOperating()判断, 改为按seg->isOperating
							if (s->getIsOperating()) {
								for (auto& entry : p->getComplements()) {
									string rank = entry.first;
									int value = entry.second;
									flt->fillCompositionRank(rank, value);
								}
							}
						}
					}
				}
			}
			//segment.planComp
			resetSegmentPlanCompByFlt(pairingList, flightIdMap);
			resetSegmentPlanCompByFlt(pairingListBeforeRun, flightIdMap);
			//将csv flight加入 pairingInputFlgihts, 按open-composition筛选
			for (auto& it : flightIdMap) {
				auto& flt = it.second;
				int sumRankValue = 0;
				for (auto& rankValue : flt->getOpenComposition()) {
					for (string& rank : this->scenario.ranks) {
						if (rankValue.first == rank)
							sumRankValue += rankValue.second;
					}
				}
				//2201023 ain, mantis#8865, PO航班输入增加fleet筛选
				auto& fleets = this->scenario.fleets;
				bool matchScenFleet = std::find(fleets.begin(), fleets.end(), flt->getFleetCD()) != fleets.end();
				//220603 DP, PO 3.0 移除flight composition输入, 不检查sumRankValue 
				//if (sumRankValue > 0 && matchScenFleet)
				if (matchScenFleet)
					this->pairingInputFlights.push_back(Segment(flt.get())); //make copy
			}
			//mantis#3310, 补齐flight.isOperating/isDhd/isFerry初始化
			for (auto& flt : pairingInputFlights) {
				flt.setIsOperating(true);
				flt.setIsDeadhead(false);
				flt.setIsBusFerry(false);
				flt.setIsTrainFerry(false);
				flt.setIsDummyBusFerry(false);
			}
		}


		//commute ferry/dhd
		{
			//20180601 ain, mantis#3417, 针对FlightComposition(Commute)逻辑, 添加 ferryFltMap
			dbg = "Flight(COMMUTE)";
			loadCsvFlightCommute(this, reader);
		}

		//resourceCtrlBaseBlh
		{
			map<string, int> resourceCtrlAug;
			map<string, int> resourceCtrlEapat;
			map<string, int> resourceCtrlIcao;
			map<string, int> resourceCtrlPort;
			int rollingDay = getRollingDaysFromRuleList(this->ruleList);
			double totalBLH = getTotalBLHFromSegments(this->pairingInputFlights);
			time_t segListStartUtc = scenario.startDtUTC;
			time_t segListEndUtc = scenario.endDtUTC + 24 * 3600 + rollingDay * 24 * 3600;
			parseResourceCtrlBaseBlh(this->resourceCtrlBaseBlh, totalBLH, this->cqfList2, this->scenario, segListStartUtc, segListEndUtc);

			resourceCtrlAug = createResourceCtrlMap(cqfList2, CQF_FUNC_AUG_RES_CTRL, segListStartUtc, segListEndUtc);
			resourceCtrlEapat = createResourceCtrlMap(cqfList2, CQF_FUNC_EXPAT_RES_CTRL, segListStartUtc, segListEndUtc);
			resourceCtrlIcao = createResourceCtrlMap(cqfList2, CQF_FUNC_ICAO_RES_CTRL, segListStartUtc, segListEndUtc);
			resourceCtrlPort = createResourceCtrlMap(cqfList2, CQF_FUNC_PORT_RES_CTRL, segListStartUtc, segListEndUtc);
			if (!resourceCtrlAug.empty()) this->resourceCtrlIdMap[CQF_FUNC_AUG_RES_CTRL] = resourceCtrlAug;
			if (!resourceCtrlEapat.empty()) this->resourceCtrlIdMap[CQF_FUNC_EXPAT_RES_CTRL] = resourceCtrlEapat;
			if (!resourceCtrlIcao.empty()) this->resourceCtrlIdMap[CQF_FUNC_ICAO_RES_CTRL] = resourceCtrlIcao;
			if (!resourceCtrlPort.empty()) this->resourceCtrlIdMap[CQF_FUNC_PORT_RES_CTRL] = resourceCtrlPort;
		}

		//check optimization_necessity
		dbg = "optimizationNecessity";
		vector<void*> csvOptimNecessity = reader.datas["OptimizationNecessity"];
		for (i = 0; i < csvOptimNecessity.size(); i++) {
			csvOptimizationNecessity* obj = (csvOptimizationNecessity*)csvOptimNecessity[i];
			if (obj->airline == scenario.airline
				&& obj->category == this->scenario.category
				&& obj->division == this->scenario.division) {
				bool exists = false;
				if (obj->componentType == "R")
					exists = isRuleExist(this->ruleList, obj->function);
				else if (obj->componentType == "C")
					exists = isRuleExist(this->cqfList2, obj->function);
				if (!exists)
					cout << "ERROR: rule/cqf " << obj->function << " is necessary for scenario airline = "
					<< obj->airline << " category = " << obj->category << " division = " << obj->division << endl;
			}
		}

		dbg = "Route";//20180928 ain, OP#1901
		vector<void*> csvRouteList = reader.datas["Route"];
		for (i = 0; i < csvRouteList.size(); i++) {
			Route* obj = (Route*)csvRouteList[i];
			this->routeList.push_back(shared_ptr<Route>(new Route(*(Route*)obj)));
		}
		dbg = "RankCombinationCriteria";//20180928 ain, OP#1901
		vector<void*> csvRankCombCriteriaList = reader.datas["RankCombinationCriteria"];
		for (i = 0; i < csvRankCombCriteriaList.size(); i++) {
			RankCombinationCriteria* obj = (RankCombinationCriteria*)csvRankCombCriteriaList[i];
			this->rankCombinationCriteriaMap[obj->id] = shared_ptr<RankCombinationCriteria>(new RankCombinationCriteria(*(RankCombinationCriteria*)obj));
		}
		dbg = "RankCombination";//20181010 ain, OP#1901
		vector<void*> csvRankCombList = reader.datas["RankCombination"];
		for (i = 0; i < csvRankCombList.size(); i++) {
			RankCombination* obj = (RankCombination*)csvRankCombList[i];
			shared_ptr<RankCombination> copy = shared_ptr<RankCombination>(new RankCombination(*(RankCombination*)obj));
			long long criteriaId = obj->rankCombCriteriaId;
			if (rankCombinationMap.find(criteriaId) == rankCombinationMap.end())
				rankCombinationMap[criteriaId] = vector<SharedPtr<RankCombination>>();
			rankCombinationMap[criteriaId].push_back(copy);
		}
		
		dbg = "AirCraft";
		vector<void*> csvAircraftList = reader.datas["Aircraft"];
		for (i = 0; i < csvAircraftList.size(); i++) {
			DBAircraft* obj = (DBAircraft*)csvAircraftList[i];
			string segRegister = obj->acReg;
			shared_ptr<DBAircraft> copy = shared_ptr<DBAircraft>(new DBAircraft(*(DBAircraft*)obj));
			this->fltIdToAircraftMap.insert(map<string, SharedPtr<DBAircraft>>::value_type(segRegister, copy));
		}

        dbg = "ScenarioKpi";
        vector<void*> csvScenarioKpiList = reader.datas["ScenarioKpi"];
        for (i = 0; i < csvScenarioKpiList.size(); i++) {
            ScenarioKpi* obj = (ScenarioKpi*)csvScenarioKpiList[i];
            scenarioKpiMap[obj->kpiNames] = obj->kpiValues;
        }
		//clear csvReader.datas, free memory
		Logger::getRuleLogger()->info("clear csv reader...");
		reader.clear();

		dbg = "dutyLimitPerDay";
		//mantis#2451, base/fleet duty limit per day
		computeBaseDutyPerDayLimit(scenario.startDtUTC, scenario.endDtUTC, pairingListLeadin, ruleList, scenario.bases, scenario.fleets, dutyLimitPerDay);

		customBizLoadData(this);

		dbg = "checkData";
		PairingCompositionCalculator calculator(this->scenario.airline, this->scenario.division,
			this->ruleList, this->fleetList, this->compositionList, this->compositionRankMap, this->rankList,this->fltIdToAircraftMap, &(this->systemParamMap));
		calculator.checkDataFleet(this->pairingInputFlights);


		dbg = "test_file";

		//log
		//////////////////////////////////////////////////////////

		test_file_leadin_info(leadinInfo, "leadin_info.txt");
		test_file_leadin_occupy(leadinOccupy, "po_leadin_occupy.txt");
		test_file_pairing(this->pairingList, "po_input_lock_pairings.txt");
		test_file_pairing(this->pairingListBeforeRun, "po_input_pairing_before_run.txt");
		test_file_flight(this->pairingInputFlights, "po_input_flight.txt");
		test_file_flight(this->pairingInputFerrys, "po_input_ferry.txt");
		test_file_flight_distribute(this->pairingInputFlights, "po_input_flight_distribute.txt");
		test_file_resource_ctrl(this->resourceCtrlIdMap, "po_resource_ctrl.txt");
		test_file_resource_ctrl_base_blh(this->resourceCtrlBaseBlh, "po_resource_ctrl_blh.txt");

		test_file_rule_po(this->ruleList, "po_input_rule.txt");
		test_file_rule_po(this->cqfList2, "po_input_cqf.txt");
		test_file_cqf_po(this->cqfList, "po_input_cqf_2.txt");

		//////////////////////////////////////////////////////////

		//
		Logger::getRuleLogger()->info("loadDataCsv end");
	}
	catch (char* e) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, char* {}", e);
		errorCode = -1;
	}
	catch (string& e) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, string {}", e);
		errorCode = -1;
	}
	catch (int e) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, int {}", e);
		errorCode = -1;
	}
	catch (std::invalid_argument& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, invalid_argument={}", ex.what());
		errorCode = -1;
	}
	catch (std::domain_error& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, domain_error={}", ex.what());
		errorCode = -1;
	}
	catch (std::length_error& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, length_error={}", ex.what());
		errorCode = -1;
	}
	catch (std::out_of_range& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, out_of_range={}", ex.what());
		errorCode = -1;
	}
	catch (std::overflow_error& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, overflow_error={}", ex.what());
		errorCode = -1;
	}
	catch (std::range_error& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, range_error={}", ex.what());
		errorCode = -1;
	}
	catch (std::underflow_error& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, underflow_error={}", ex.what());
		errorCode = -1;
	}
	catch (std::bad_array_new_length& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, bad_array_new_length={}", ex.what());
		errorCode = -1;
	}

	catch (std::bad_alloc& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, bad_alloc={}", ex.what());
		Logger::getRuleLogger()->error("current mem:{} MB, peak mem: {}", (getProcessCurrentMem() / (1024 * 1024)), (getProcessPeakMem() / (1024 * 1024)));
		errorCode = -1;
	}
	catch (std::bad_cast& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, bad_cast={}", ex.what());
		errorCode = -1;
	}
	catch (std::bad_exception& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, bad_exception={}", ex.what());
		errorCode = -1;
	}
	catch (std::bad_typeid& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, bad_typeid={}", ex.what());
		errorCode = -1;
	}
	catch (std::bad_weak_ptr& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, bad_weak_ptr={}", ex.what());
		errorCode = -1;
	}
	catch (std::ios_base::failure& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, ios_base::failure={}", ex.what());
		errorCode = -1;
	}
	catch (std::logic_error& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, logic_error={}", ex.what());
		errorCode = -1;
	}
	catch (std::system_error& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, system_error={}", ex.what());
		errorCode = -1;
	}
	catch (std::runtime_error& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, runtime_error={}", ex.what());
		errorCode = -1;
	}
	catch (exception& ex) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, runtime_error={}, dbg={} i={}", ex.what(), dbg, i);
		errorCode = -1;
	}
	catch (...) {
		Logger::getRuleLogger()->error("Exception: readCsv fail, dbg={} i={}", dbg, i);
		errorCode = -1;
	}
	if (errLog.is_open())
		errLog.close();
	return errorCode;
}

//按scenarioId过滤pairing
vector<Pairing*> filterPairingByScenario(vector<Pairing*>& list, long long scenarioId) {
	vector<Pairing*> result;
	for (auto& pg : list) {
        // live leadin will use 0 as scenario Id, PO pairing will have scenario Id assigned before this call
        // scenario leadin may have the same scenario id as optimized pairing, add DBID == 0 as optimized pairing
		if (scenarioId == pg->getScenarioId() && pg->getDbId() == 0)
			result.push_back(pg);
	}
	return result;
}

int CrewDataContext::savePoCsv(char * filepath, vector<Pairing*>& list, vector<Segment*> &imbalanceSegments) {
	vector<void*> csvImbalanceFlightList;
	int errorCode = 0;
	int i = 0, j = 0;
	string dbg = "";
	ofstream outfile(filepath, std::ios_base::binary | std::ios_base::out);
	ofstream errLog;
	try {

		// no need to remove leadins in DB, PO will manage pairings for output
		//20200415 ain, mantis#7997, savePO结果移除 leadin pairing
		// vector<Pairing*> pgOfScen = filterPairingByScenario(list, this->scenarioId);

		//预处理：临时 pairingId/dutyId, 复制pairing/duty/segment副本
		//20180704 ain, mantis#3580, savePoCsv逻辑复制 pairing/duty/seg副本, 避免duty/seg被多pairing重复覆盖问题
		//20181011 ain, mantis#4212, 先执行 duty/seg copy, 再计算 region/fdp/assignment等，
		dbg = "pre-save id";
		cout << "savePoCsv makePairingDutySegmentCopy" << endl;
		vector<Pairing*> pairingCopies = makePairingDutySegmentCopy(list, scenario, true);

		for (Pairing* p : pairingCopies) {
			p->setDivision(this->scenario.division);
			p->setFiliale(this->scenario.airline);
		}

		dbg = "pre-save airport";
		cout << "savePoCsv resetPairingDutyAirport" << endl;
		resetPairingDutyAirport(pairingCopies);
		
		dbg = "pre-save pairing.region";
		cout << "savePoCsv resetPairingRegion" << endl;
		resetPairingRegion(pairingCopies);

		dbg = "pre-save bus/rail segment assignment";
		cout << "savePoCsv resetPairingSegmentAssignment" << endl;
		resetPairingSegmentAssignment(pairingCopies);
	
		///TEST
		//for (Pairing* p : pairingCopies) {
		//	for (auto& d : p->getDutyVec()) {
		//		cout << "**DBG FDP 0 duty flt_id=" << d->getSegment(0)->getDBId()
		//			<< " fdp=" << d->getPlanFDP()
		//			<< endl;
		//	}
		//}

		dbg = "reset FDP";
		for (Pairing* p : pairingCopies) {
			calculatePairingDutyTimes(p, this);
		}

		///TEST
		//for (Pairing* p : pairingCopies) {
		//	for (auto& d : p->getDutyVec()) {
		//		cout << "**DBG FDP 1 duty flt_id=" << d->getSegment(0)->getDBId()
		//			<< " fdp=" << d->getPlanFDP()
		//			<< endl;
		//	}
		//}

		//20180428 ain, mantis#3228, 预处理 duty.actFt/actFdp/actDp/historyBlk
		dbg = "pre-save fdp/dp/blk";
		cout << "savePoCsv resetPairingDutyFdpDpBlk" << endl;
		resetPairingDutyFdpDpBlk(pairingCopies);

		//20190303 ain, mantis#5045, savePO 按 pickup修正pairing.start
		cout << "savePoCsv pairing.start=duty-pickup" << endl;
		resetPairingStartByPickup(pairingCopies);

		dbg = "savePoCsv resetPairingDutyNodes";
		cout << "savePoCsv resetPairingDutyNodes" << endl;
		//20191120 ain, mantis#7105, savePO补齐 dutyNode (brief/debrief/pick/drop)
		resetPairingDutyNodes(pairingCopies, this);

		//20200904 ain, mantis#8731, savePO, duty.layoverNits
		calculateDutyLayoverNights(pairingCopies, this);

		//20190508 ain, mantis#5518, 重构代码, 只有savePO需要法规重算配比 rankValue
		//20230427 PD GJ-115, 跳过重算配比，使用PO内部计算结果,此处根据PO结果填充segment criteria ID
		cout << "savePoCsv pairing.composition" << endl;
		PairingCompositionCalculator calculator(this->scenario.airline, this->scenario.division, this->ruleList, this->fleetList, this->compositionList, this->compositionRankMap, this->rankList,this->fltIdToAircraftMap, &(this->systemParamMap));
		calculator.setDbContext(this);
		try {
			calculator.setEnableDebugLog(false);
			for (auto pg : pairingCopies) {
				calculator.updateRankCombinationCriteriaID(pg);
			}
		}
		catch (...) {}
		//20190615 ain, savePoCsv流程, 全部按 pairingCopies代替 this->pairingList
		//20190527 ZZM, rankComb after composition
		//20180926 ain, mantis#4127, savePO, label
		//20180929 ain, OP#1901, pairing.rankCombCriteriaID
		cout << "savePoCsv pairing.label" << endl;
		for (Pairing * p : pairingCopies) {
			if (p->getLabel().empty()) {
				p->setLabel(makePairingLabel(p, this));
			}
		}

		// calculate attribute after a
		//20190223 ain, OP#2003, pairing.attribute
		cout << "savePoCsv pairing.attr" << endl;
		PairingAttributeCalculator pairingAttrCalculator(scenario.airline, flightList, routeList, attributeIdMap, airportCodeMap, assignmentNameGroupMap, rankMap, tagCategoryList, tagFlightGroupMap,
			tagDutyGroupMap, tagPairingGroupMap, tagGroupTableMap, tagGroupMap, tagFlightCompositionGroupMap);
		if (this->version == 2 || scenario.airline == "JG") {
			pairingAttrCalculator.calculateAndSetPairingAttr(pairingCopies);
		} else {
			pairingAttrCalculator.calculateAndSetPairingTag(pairingCopies);
		}

		//20230427 PD GJ-115, 跳过重算配比，使用PO内部结果
		//cout << "savePoCsv pairing.rank-combination" << endl;
		//calculatePairingListRankCombination(pairingCopies, this);
		Logger::getRuleLogger()->info("savePoCsv start");
		errLog.open("err.log");
		test_file_pairing(pairingCopies, "po_output_pairing.txt");

		//read csv
		dbg = "reader.";
		crewCsvReader reader;
		//scenario
		dbg = "Scenario";
		shared_ptr<csvParser> scenarioParser = reader.getParser("Scenario");
		vector<void*> dataScenarioList;
		dataScenarioList.push_back(&this->scenario);
		reader.write(outfile, "Scenario", dataScenarioList, scenarioParser);
		//cleanupList(dataScenarioList);
		//pairing
	
		// auto outputPairing = pairingCopies;
		// no need to copy leadin pairings again.
		// std::copy(begin(this->pairingListBeforeRun), end(this->pairingListBeforeRun), back_inserter(outputPairing));
		dbg = "Pairing/Duty/Segment";
		savePairingDutySegmentToCsv(outfile, pairingCopies, reader, this);
		//cleanupList(csvSegList);
		//cleanup
		for (auto& p : pairingCopies) {
			for (auto& d : p->getDutyVec()) {
				for (auto& s : d->getSegments())
					delete s;
				delete d;
			}
			delete p;
		}
		pairingCopies.clear();
		dbg = "imbalanceFlight";
		shared_ptr<csvParser> imbalanceFlightParser = reader.getParser("imbalanceFlightParser");
		for (auto& flt : imbalanceSegments) {
			csvImblanceFlight * item = new csvImblanceFlight;
			item->scenarioId = this->scenarioId;
			item->flightId = flt->getDBId();
			item->user = this->scenario.idUser;
			item->tmst = time(0);
			csvImbalanceFlightList.push_back(item);
		}
		reader.write(outfile, "imbalanceFlightParser", csvImbalanceFlightList, imbalanceFlightParser);
		cleanupList(csvImbalanceFlightList);

		dbg = "cleanup pairingCopies";
		clearPairingDutySegmentCopy(pairingCopies);
	}
	CATCH_EXCEPTIONS("savePoCsv");

	if (errLog.is_open())
		errLog.close();
	if (outfile.is_open())
		outfile.close();
	return errorCode;
}
//按 flt.plan赋值 seg.plan
void resetSegmentPlanCompByFlt(vector<Pairing*>& pairings, unordered_map<long long, SharedPtr<Segment>>& flightIdMap) {
	for (Pairing* p : pairings) {
		for (Duty* d : p->getDutyVec()) {
			for (Segment* s : d->getSegments()) {
				if (flightIdMap.find(s->getDBId()) != flightIdMap.end()) {
					auto flt = flightIdMap[s->getDBId()];
					s->setPlanComposition(flt->getPlanComposition());
					s->setCompositionId(flt->getCompositionId());
				}
			}
		}
	}
}


//检查目标function是否存在与list中
bool isRuleExist(vector<DBRule>& list, int function) {
	for (auto& r : list) {
		if (r.function == function)
			return true;
	}
	return false;
}

double getTotalBLHFromSegments(vector<Segment>& list) {
	double blh = 0.0;
	for (auto& s : list) {
		blh += s.getBlkSeconds() / 60;
	}
	return blh;
}

//20190303 ain, mantis#5045, savePO按 pickup修正 pairing.start
//20190403 ain, mantis#5045, ptn.end = lastDuty.end + dropoff
void resetPairingStartByPickup(vector<Pairing*>& list) {

	for (Pairing* p : list) {
		if (p->getNumDuties() > 0) {
			Duty* first = p->getDuty(0);
			Duty* last = p->getDuty(p->getNumDuties() - 1);

			int pickupSecs = 60 * first->getMinPickup();
			int dropoffSecs = 60 * last->getMinDropoff();

			p->setStartTimeUtcSch(first->getStartTimeUtcSch() - pickupSecs);
			p->setStartTimeLocSch(first->getStartTimeLocSch() - pickupSecs);
			p->setEndTimeUtcSch(last->getEndTimeUtcSch() + dropoffSecs);
			p->setEndTimeLocSch(last->getEndTimeLocSch() + dropoffSecs);

			p->syncActTimeBySchTime();
		}
	}
}