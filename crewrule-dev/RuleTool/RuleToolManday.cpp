/*
RuleTool模块：计算 manday
*/
#include <stdio.h>
#include <time.h>
#include <fstream>
#include <algorithm>
#include "RuleTool.h"
//#include "UtilFunc.h"
#include "UtilFunc.h"
#include "utils/SegmentUtils.h"
#include "utils/TrainingCourseUtils.h"

inline static int GetLandingStatType(const std::shared_ptr<CrewDataContext>& dbData) {
	int landingStatType = 0;
	string strLandingStatType = strToUpper(dbData->systemParamMap["LANDING_STATISTIC_TYPE"]);//取值：ALL - 0、PF - 1
	if (strLandingStatType.empty() || strLandingStatType == "ALL") {
		landingStatType = 0;
	}
	else if (strLandingStatType == "PF") {
		landingStatType = 1;
	}
	return landingStatType;
}

inline void GetOrgGroundRosterMap(unordered_map<long long, std::shared_ptr<ROSTER>>& orgRosterMap, const std::shared_ptr<CREW>& crew) {
	for (auto& roster : crew->rosterList) {
		if (roster == nullptr || roster->pairing != nullptr) {
			continue;
		}
		orgRosterMap[roster->rosterId] = std::make_shared<ROSTER>(*roster);
	}
}
		
int RuleTool::reCalculateManday(long long scenarioId) {

	bool success = false;
	int ret = 0;
	time_t startLoc = 0;
	time_t endLoc = 0;
	Scenario scenario;
	vector<SharedPtr<CREW_MANDAY_CC_AM>> mandayCcList;
	vector<SharedPtr<CREW_MANDAY_FD>> mandayFdList;
	unordered_map<long long, std::shared_ptr<ROSTER>> orgRosterMap;

	ret = dbData->loadData( scenarioId);
	_legality->setDataContext(dbData);
	if (ret != 0) {
		goto CLEANUP;
	}

	//调用rule 重新计算,manday计算结果保存在各个 crew.mandayList
	printf("crewList.size=%zd\n", dbData->crewList.size());
	printf("%s reCalculateManday start\n", utcToUtcString(time(0)).c_str());
	for (std::size_t i = 0; i < dbData->crewList.size(); i++) {
		SharedPtr<CREW>& crew = dbData->crewList[i];
		string idcrew = crew->idCrew;

		GetOrgGroundRosterMap(orgRosterMap, crew);

		if (crew->division == "P") {
			crew->mandayFdList = _legality->calculateMandayFD(dbData, crew, crew->rosterList);
			mandayFdList.insert(mandayFdList.end(), crew->mandayFdList.begin(), crew->mandayFdList.end());
		}
		else {
			crew->mandayCcAmList = _legality->calculateMandayCC(dbData, crew, crew->rosterList);
			mandayCcList.insert(mandayCcList.end(), crew->mandayCcAmList.begin(), crew->mandayCcAmList.end());
		}
	}
	printf("%s reCalculateManday end\n", utcToUtcString(time(0)).c_str());

	//save manday
	if (!mandayCcList.empty() || !mandayFdList.empty()) {
		ret = dbData->saveManday(orgRosterMap);
	}

CLEANUP:
	if (ret != 0) {
		printf("ERROR: fail %d\n", ret);
	}
	return ret;
}

int RuleTool::reCalculateMandayByPairing(long long scenarioId, string& pairingIdStr) {

	int ret = 0;
	vector<SharedPtr<CREW_MANDAY_CC_AM>> mandayCcList;
	vector<SharedPtr<CREW_MANDAY_FD>> mandayFdList;
	unordered_map<long long, std::shared_ptr<ROSTER>> orgRosterMap;
	vector<long long> pairingIds;
	vector<string> pairingIdStrs;
	// input pairingIds 
	split(pairingIdStr.c_str(), ',', pairingIdStrs);
	for (string str : pairingIdStrs) {
		pairingIds.push_back(atoll(str.c_str()));
	}
	// load scenario by pairing
	ret = dbData->loadDataByPairing(scenarioId, pairingIds);
	_legality->setDataContext(dbData);
	if (ret != 0) {
		goto CLEANUP;
	}

	//调用rule 重新计算,manday计算结果保存在各个 crew.mandayList
	printf("crewList.size=%zd\n", dbData->crewList.size());
	printf("%s reCalculateManday start\n", utcToUtcString(time(0)).c_str());
	for (std::size_t i = 0; i < dbData->crewList.size(); i++) {
		SharedPtr<CREW>& crew = dbData->crewList[i];
		string idcrew = crew->idCrew;

		GetOrgGroundRosterMap(orgRosterMap, crew);

		if (crew->division == "P") {
			crew->mandayFdList = _legality->calculateMandayFD(dbData, crew, crew->rosterList);
			mandayFdList.insert(mandayFdList.end(), crew->mandayFdList.begin(), crew->mandayFdList.end());
		}
		else {
			crew->mandayCcAmList = _legality->calculateMandayCC(dbData, crew, crew->rosterList);
			mandayCcList.insert(mandayCcList.end(), crew->mandayCcAmList.begin(), crew->mandayCcAmList.end());
		}
	}

	//OP#1951
	reCalculateMandayFD_updowns_expBlh();

	printf("%s reCalculateManday end\n", utcToUtcString(time(0)).c_str());

	//save manday
	if (!mandayCcList.empty() || !mandayFdList.empty()) {
		ret = dbData->saveManday(orgRosterMap);
	}

CLEANUP:
	if (ret != 0) {
		printf("ERROR: %d\n", ret);
	}
	return ret;
}

int RuleTool::reCalculateMandayByCrew(long long scenarioId, string& crewIdStr, string startDt, string endDt, string division) {

	int ret = 0;
	vector<SharedPtr<CREW_MANDAY_CC_AM>> mandayCcList;
	vector<SharedPtr<CREW_MANDAY_FD>> mandayFdList;
	unordered_map<long long, std::shared_ptr<ROSTER>> orgRosterMap;
	vector<string> crewIds;
	
	// input pairingIds 
	split(crewIdStr.c_str(), ',', crewIds);
	// load scenario by pairing
	if (strToUpper(dbData->configDataSource) == "FILE") {
		ret = dbData->loadData(scenarioId);
	}
	else {
		ret = dbData->loadDataByCrewFromHttpServer(scenarioId, crewIds, utcStrToUtc((char*)startDt.c_str()), utcStrToUtc((char*)endDt.c_str()), division);
	}
	_legality->setDataContext(dbData);
	if (ret != 0) {
		goto CLEANUP;
	}

	//调用rule 重新计算,manday计算结果保存在各个 crew.mandayList
	printf("crewList.size=%zd\n", dbData->crewList.size());
	printf("%s reCalculateManday start\n", utcToUtcString(time(0)).c_str());
	for (std::size_t i = 0; i < dbData->crewList.size(); i++) {
		SharedPtr<CREW>& crew = dbData->crewList[i];
		string idcrew = crew->idCrew;

		GetOrgGroundRosterMap(orgRosterMap, crew);

		if (crew->division == "P") {
			crew->mandayFdList = _legality->calculateMandayFD(dbData, crew, crew->rosterList);
			mandayFdList.insert(mandayFdList.end(), crew->mandayFdList.begin(), crew->mandayFdList.end());
		}
		else {
			crew->mandayCcAmList = _legality->calculateMandayCC(dbData, crew, crew->rosterList);
			mandayCcList.insert(mandayCcList.end(), crew->mandayCcAmList.begin(), crew->mandayCcAmList.end());
		}
	}

	//OP#1951
	reCalculateMandayFD_updowns_expBlh();

	printf("%s reCalculateManday end\n", utcToUtcString(time(0)).c_str());

	//save manday
	if (!mandayCcList.empty() || !mandayFdList.empty()) {
		ret = dbData->saveManday(orgRosterMap);
	}

CLEANUP:
	if (ret != 0) {
		printf("ERROR: %d\n", ret);
	}
	return ret;
}

int RuleTool::reCalculateManday(long long scenarioId, string startDt, string endDt, string division ) {
	bool success = false;
	int ret = 0;
	time_t startLoc = 0;
	time_t endLoc = 0;
	Scenario scenario;
	unordered_map<long long, std::shared_ptr<ROSTER>> orgRosterMap;
	//PairingDBContext * ctx = 0;

	//ctx = PairingDBContext::getDbConnection();
	//CheckAndReconnect(ctx);

	//20180410 ain, mantis#3104, 添加cmdline startDt/endDt检查
	if (!checkDateTimeStr(startDt.c_str())) {
		printf("ERROR: invalid date '%s'\n", startDt.c_str());
		goto CLEANUP;
	}
	if (!checkDateTimeStr(endDt.c_str())) {
		printf("ERROR: invalid date '%s'\n", endDt.c_str());
		goto CLEANUP;
	}

	startLoc = utcStrToUtc((char*)startDt.c_str());
	endLoc = utcStrToUtc((char*)endDt.c_str());
	//20180321 ain, mantis#2985, 数据源兼容 db/server 
	ret = dbData->loadData(scenarioId, startLoc, endLoc, 0, "", "", "", division); //不指定base/rank/fleet/ruleSet
	if (ret != 0) {
		printf("load data fail %d\n", ret);
		goto CLEANUP;
	}
	//success = dbData->loadData(ctx, scenarioId, localToUtc(startLoc), localToUtc(endLoc));
	_legality->setDataContext(dbData);

	//调用rule 重新计算,manday计算结果保存在各个 crew.mandayList
	printf("%5d  reCalculateManday start\n", static_cast<int>(time(0) % 3600));
	printf("       crewList.size=%zd\n", dbData->crewList.size());
	for (std::size_t i = 0; i < dbData->crewList.size(); i++) {
		SharedPtr<CREW>& crew = dbData->crewList[i];
		string idcrew = crew->idCrew;

		GetOrgGroundRosterMap(orgRosterMap, crew);

		if (crew->division == "P") {
			crew->mandayFdList = _legality->calculateMandayFD(dbData, crew, crew->rosterList);
		}
		else {
			crew->mandayCcAmList = _legality->calculateMandayCC(dbData, crew, crew->rosterList, false);
		}
	}

	//OP#1951
	reCalculateMandayFD_updowns_expBlh();

	//save manday
	dbData->saveManday(orgRosterMap);
	
CLEANUP:
	printf("reCalculateManday end\n");
	//if (ctx->errorCode != 0) {
	//	printf("ERROR: %s\n", ctx->errorMsgBuf);
	//	ret = ctx->errorCode;
	//}

	return ret;
}

//临时结构体，辅助计算 mandayFD. updowns/cat2_updowns/exp_blh
struct ST_MANDAY_FD_TMP {
	int updowns = 0;
	int cat2Updowns = 0;
	int expBlh = 0;
	int takeoff = 0;
	int landing = 0;
	std::map<string, int> fleetTakeoff{};//特定机型起飞次数，map<机型,起飞次数>
	std::map<string, int> fleetLanding{};//特定机型降落次数，map<机型,降落次数>
	std::map<string, int> nightFleetTakeoff{};//夜航特定机型起飞次数，map<机型,起飞次数>
	std::map<string, int> nightFleetLanding{};//夜航特定机型降落次数，map<机型,降落次数>
};
//计算 mandayFD. updowns/cat2_updowns/exp_blh
void RuleTool::reCalculateMandayFD_updowns_expBlh() {

	//flt_id -> voyage
	map<long long, Voyage*> fltToVoyage;
	for (auto& voyage : dbData->voyageList) {
		fltToVoyage[voyage->getFltId()] = voyage.get();
	}

	//crew_id -> voyage_detail list
	map<string, vector<VoyageDetail*>> crewToDetail;
	for (auto& voyage : dbData->voyageList) {
		for (auto& detail : voyage->getDetails()) {
			crewToDetail[detail->getCrewId()].push_back(detail.get());
		}
	}

	//flt_id -> flt.depTimeDate
	map<long long, Segment*> fltIdMap;
	for (auto& flt : dbData->flightList) {
		fltIdMap[flt->getDBId()] = flt.get();
	}
	const auto & rule3098 = dbData->getRuleFunctions(RULES::TAKEOFF_AND_LANDING_NUMBER_DEFINITION);
	
	string Route;
	string unit, type;
	
	int takeoffAndLandingNum = 0;

	int landingStatType = GetLandingStatType(dbData);//landingStatType 取值：ALL - 0、PF - 1

	for (auto& crew : dbData->crewList) {

		//manday local timezone
		string crewBase = crew->getPrimeBase();
		int crewBaseOffsetMinutes = this->dbData->getAirportOffsetMinutes(crewBase);
		string timezone = this->dbData->systemParamMap["CREW_MANDAY_STORE_TIMEZONE"];
		int mandayTimezoneMinutes = 0;
		if (timezone == "CREW_BASE" || timezone == "UTC2")
			mandayTimezoneMinutes = crewBaseOffsetMinutes;
		else if (timezone != "UTC")
			mandayTimezoneMinutes = this->dbData->getAirportOffsetMinutes(timezone);

		//only for pilot
		if (crew->division != "P") {
			continue;
		}
		
		//voyage -> sum(updowns/ cat2/ expBlh)
		map<time_t, ST_MANDAY_FD_TMP> tmpResult;            //manday.dateLoc -> sum(updowns/ cat2/ expBlh)
		for (auto& detail : crewToDetail[crew->idCrew]) {
			long long flt_id = detail->getFltId();
			Voyage* voyage = fltToVoyage[flt_id];
			if (fltIdMap.find(flt_id) == fltIdMap.end()) {
				cout << "ERROR: invalid voyage, voyage.id=" << voyage->getId() << ", flt=" << flt_id << " not exist" << endl;
				continue;
			}
			Segment* flight = fltIdMap[flt_id];
			time_t depOfMandayTimeZone = flight->getStartTimeUtcAct() + mandayTimezoneMinutes * 60;
			time_t dateLoc = getStartTimeOfDay(depOfMandayTimeZone);
			/*int downs = detail->getLeftDowns() + detail->getRightDowns();
			int ups = detail->getLeftUps() + detail->getRightUps();*/
			int downs = detail->getTouchDownTimes();
			int ups = detail->getTakeOffTimes();
			int updowns = ups > downs ? downs : ups; // 取较小的值

			// 模拟机直接赋值3
			/*shared_ptr<RosterFlight> rf = this->dbData->rosterFlightMgr.get(flt_id, crew->idCrew);
			string::size_type idx = rf->tsFlag.find("SC");
			if (rf->assignment == "SIM" && idx != string::npos) updowns = 3;*/
			if (detail->getIlsType() == "ILS2") {
				tmpResult[dateLoc].cat2Updowns += updowns; //二类
			}
			else {
				tmpResult[dateLoc].updowns += updowns;     //一类
				tmpResult[dateLoc].takeoff += ups;
				tmpResult[dateLoc].landing += downs;

				if (landingStatType == 0) {//LANDING_STATISTIC_TYPE=ALL
					tmpResult[dateLoc].fleetTakeoff[flight->getFleetCD()] += ups;
					tmpResult[dateLoc].fleetLanding[flight->getFleetCD()] += downs;

					if (SegmentUtils::IsNightTaskOff(flight, dbData)) {
						tmpResult[dateLoc].nightFleetTakeoff[flight->getFleetCD()] += ups;
					}
					if (SegmentUtils::IsNightLanding(flight, dbData)) {
						tmpResult[dateLoc].nightFleetLanding[flight->getFleetCD()] += downs;
					}
				}
				else if (landingStatType == 1) {//LANDING_STATISTIC_TYPE=PF
					auto& pilotRole = detail->getPilotRole();
					tmpResult[dateLoc].fleetTakeoff[flight->getFleetCD()] += (pilotRole == "P" ? ups : 0);
					tmpResult[dateLoc].fleetLanding[flight->getFleetCD()] += (pilotRole == "P" ? downs : 0);

					if (SegmentUtils::IsNightTaskOff(flight, dbData)) {
						tmpResult[dateLoc].nightFleetTakeoff[flight->getFleetCD()] += (pilotRole == "P" ? ups : 0);
					}
					if (SegmentUtils::IsNightLanding(flight, dbData)) {
						tmpResult[dateLoc].nightFleetLanding[flight->getFleetCD()] += (pilotRole == "P" ? downs : 0);
					}
				}
			}
			tmpResult[dateLoc].expBlh += detail->getExpBlockHrs();
		}

		// 模拟机没有任务书，直接从rosterflight上判断
		// 模拟机直接赋值3
		
		// TG 8098新增参数sim assignments, takeoffAndLanding number
		// 针对sim航班，计算起飞降落次数
		// 2025.02.18 新增起飞降落数定义法规3098

		
		vector<SharedPtr<ROSTER>> rosters = crew->rosterList;
		
		// 刷新特殊roster的，只计算已经发生的roster
		time_t now;
		time(&now);
		time_t checkTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(now, 0) - 1;
		for (auto roster : rosters) {
			if (!rule3098.empty()) {
				if (roster->actStrLoc > now)
					continue;
				string header, headeValue;
				vector<string> baseVec, rankVec, crewTeamVec, fleetVec;
				string assignmentsStr, assignmentGroupsStr, coursesStr, rolesStr;
				vector<string> assignmentVec, assignmentGroupVec, courseVec, roleVec;
				for (const auto& dbRule : rule3098) {

					map<string, string>::const_iterator iter;

					const auto& parameter = dbRule.params;
					for (iter = parameter.begin(); iter != parameter.end(); ++iter)
					{
						header = iter->first;
						headeValue = iter->second;
						if (header == "BASES") {
							split(headeValue, '|', baseVec);
						}
						else if (header == "RANKS") {
							split(headeValue, '|', rankVec);
						}
						else if (header == "FLEETS") {
							split(headeValue, '|', fleetVec);
						}
						else if (header == "CREW TEAMS") {
							split(headeValue, '|', crewTeamVec);
						}
						else if (header == "ASSIGNMENTS") {
							assignmentsStr = headeValue;
							split(headeValue, '|', assignmentVec);
						}
						else if (header == "ASSIGNMENT GROUPS") {
							assignmentGroupsStr = headeValue;
							split(headeValue, '|', assignmentGroupVec);
						}
						else if (header == "COURSES") {
							coursesStr = headeValue;
							split(headeValue, '|', courseVec);
						}
						else if (header == "ROLES") {
							rolesStr = headeValue;
							split(headeValue, '|', roleVec);
						}
						else if (header == "NO. OF TAKEOFF AND LANDING") {
							takeoffAndLandingNum = stoi(headeValue);
						}
					}
					vector<string> positionsVec;
					split("*", '|', positionsVec);
					if (!Utility::GetInstancePtr()->isCrewQualified(crew, baseVec, rankVec, fleetVec, crewTeamVec, positionsVec, dbData->startUtc, dbData->endUtc)) {
						continue;
					}
					bool found = false;
					// 如果是rosterGround
					if (!roster->pairing) {
						time_t depOfMandayTimeZone = roster->getStartTimeUtcAct() + mandayTimezoneMinutes * 60;
						time_t dateLoc = getStartTimeOfDay(depOfMandayTimeZone);
						string course = "";
						const auto & tmCourse = TrainingCourseUtils::GetCourseByCourseId(roster->tmProgramCourseId, this->dbData);
						if (tmCourse) {
							course = tmCourse->courseCode;
						}
						
						if (takeoffAndLandingNum > 0
							&& (assignmentsStr == "*" || std::find(assignmentVec.begin(), assignmentVec.end(), roster->qualifier) != assignmentVec.end())
							&& (assignmentGroupsStr == "*" || std::find(assignmentGroupVec.begin(), assignmentGroupVec.end(), roster->duty) != assignmentGroupVec.end())
							&& (coursesStr == "*" || std::find(courseVec.begin(), courseVec.end(), course) != courseVec.end())
							&& (rolesStr == "*" || std::find(roleVec.begin(), roleVec.end(), roster->tmRole) != roleVec.end())
							) {
							tmpResult[dateLoc].updowns += takeoffAndLandingNum;
							tmpResult[dateLoc].takeoff += takeoffAndLandingNum;
							tmpResult[dateLoc].landing += takeoffAndLandingNum;
						}
					}
					else {
						vector<shared_ptr<RosterFlight>> rfs = this->dbData->rosterFlightMgr.get(crew->idCrew);
						for (const auto& rf : rfs) {
							if (rf->pairingId == roster->pairId) {
								if (fltIdMap.find(rf->fltId) == fltIdMap.end())
									continue;
								time_t depOfMandayTimeZone = fltIdMap[rf->fltId]->getStartTimeUtcAct() + mandayTimezoneMinutes * 60;
								time_t dateLoc = getStartTimeOfDay(depOfMandayTimeZone);
								string course = rf->courseCode;
								
								if (takeoffAndLandingNum > 0
									&& (assignmentsStr == "*" || std::find(assignmentVec.begin(), assignmentVec.end(), rf->assignment) != assignmentVec.end())
									&& (assignmentGroupsStr == "*" || std::find(assignmentGroupVec.begin(), assignmentGroupVec.end(), roster->duty) != assignmentGroupVec.end())
									&& (coursesStr == "*" || std::find(courseVec.begin(), courseVec.end(), course) != courseVec.end())
									&& (rolesStr == "*" || std::find(roleVec.begin(), roleVec.end(), rf->tmRole) != roleVec.end())
									) {
									tmpResult[dateLoc].updowns += takeoffAndLandingNum;
									tmpResult[dateLoc].takeoff += takeoffAndLandingNum;
									tmpResult[dateLoc].landing += takeoffAndLandingNum;
								}
							}
						}
					}
					if (found)
						break;
				}
			}
		}	
				
		//遍历manday，更新updowns/cat2Updowns/expBlh
		for (auto& md : crew->mandayFdList) {
			if (md->crewDateUtc >= dbData->startUtc && md->crewDateUtc <= dbData->endUtc) {
				md->updowns = 0;
				md->cat2Updowns = 0;
				md->expBlh = 0;
			}
			if (tmpResult.find(md->dateLoc) != tmpResult.end()) {
				md->updowns = tmpResult[md->dateLoc].updowns;
				md->cat2Updowns = tmpResult[md->dateLoc].cat2Updowns;
				md->expBlh = tmpResult[md->dateLoc].expBlh;
				md->takeoff = tmpResult[md->dateLoc].takeoff;
				md->landing = tmpResult[md->dateLoc].landing;
				md->fleetTakeoff = tmpResult[md->dateLoc].fleetTakeoff;
				md->fleetLanding = tmpResult[md->dateLoc].fleetLanding;
				md->nightFleetTakeoff = tmpResult[md->dateLoc].nightFleetTakeoff;
				md->nightFleetLanding = tmpResult[md->dateLoc].nightFleetLanding;
			}
		}
	}

}