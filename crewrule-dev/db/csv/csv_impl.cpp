#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

crewCsvReader::crewCsvReader() {

	tableParserMap["LiveConfig"] = shared_ptr<csvParser>(new liveConfigParser);
	tableParserMap["RuleSet"] = shared_ptr<csvParser>(new ruleSetParser);
	tableParserMap["Rule"] = shared_ptr<csvParser>(new ruleParser);
	tableParserMap["RulePhaseConfig"] = shared_ptr<csvParser>(new rulePhaseConfigParser);
	tableParserMap["Rule(ALL)"] = shared_ptr<csvParser>(new ruleParser);
	tableParserMap["Cqf"] = shared_ptr<csvParser>(new cqfParser);
	tableParserMap["RuleParameter"] = shared_ptr<csvParser>(new ruleParamParser);
	tableParserMap["RuleParameter(ALL)"] = shared_ptr<csvParser>(new ruleParamParser);
	tableParserMap["CqfParameter"] = shared_ptr<csvParser>(new cqfParamParser);

	tableParserMap["Flight"] = shared_ptr<csvParser>(new flightParser);
	tableParserMap["FlightComposition"] = shared_ptr<csvParser>(new flightCompositionParser);
	tableParserMap["FlightRankValue"] = shared_ptr<csvParser>(new rankValueParser);
	tableParserMap["FlightAttribute"] = shared_ptr<csvParser>(new flightAttributeParser);
	tableParserMap["FlightBlhHistory"] = shared_ptr<csvParser>(new flightBlhHistoryParser);

	tableParserMap["Base"] = shared_ptr<csvParser>(new baseParser);
	tableParserMap["Rank"] = shared_ptr<csvParser>(new rankParser);
	tableParserMap["RankPosition"] = shared_ptr<csvParser>(new rankPositionParser);
	tableParserMap["Team"] = shared_ptr<csvParser>(new teamParser);
	tableParserMap["Fleet"] = shared_ptr<csvParser>(new fleetParser);
	tableParserMap["Qualification"] = shared_ptr<csvParser>(new qualificationParser);
	tableParserMap["Composition"] = shared_ptr<csvParser>(new compositionParser);
	tableParserMap["CompositionRank"] = shared_ptr<csvParser>(new compositionRankParser);
	tableParserMap["CompositionLoad"] = shared_ptr<csvParser>(new compositionLoadParser);

	tableParserMap["Dictionary"] = shared_ptr<csvParser>(new dictionaryParser);

	tableParserMap["Pairing"] = shared_ptr<csvParser>(new pairingParser);
	tableParserMap["PairingComposition"] = shared_ptr<csvParser>(new pairingCompositionParser);
	tableParserMap["PairingDuty"] = shared_ptr<csvParser>(new dutyParser);
	tableParserMap["PairingSegment"] = shared_ptr<csvParser>(new segmentParser);
	tableParserMap["PairingDutySegment"] = shared_ptr<csvParser>(new segmentParser);
	tableParserMap["PairingRankValue"] = shared_ptr<csvParser>(new rankValueParser);

	tableParserMap["Crew"] = shared_ptr<csvParser>(new crewParser);
	tableParserMap["CrewLastPublishDate"] = shared_ptr<csvParser>(new crewLastPublishDateParser);
	tableParserMap["CrewRank"] = shared_ptr<csvParser>(new crewRankParser);
	tableParserMap["CrewCompanyRank"] = shared_ptr<csvParser>(new crewCompanyRankParser);
	tableParserMap["CrewBase"] = shared_ptr<csvParser>(new crewBaseParser);
	tableParserMap["CrewFleet"] = shared_ptr<csvParser>(new crewFleetParser);
	tableParserMap["CrewQualification"] = shared_ptr<csvParser>(new crewQualificationParser);
	tableParserMap["CrewCertificate"] = shared_ptr<csvParser>(new crewQualificationParser);
	tableParserMap["CrewLicense"] = shared_ptr<csvParser>(new crewQualificationParser);
	tableParserMap["CrewLanguage"] = shared_ptr<csvParser>(new crewQualificationParser);
	tableParserMap["CrewGuaranteeHour"] = shared_ptr<csvParser>(new crewGuaranteeHourParser);
	tableParserMap["Crew(COF)"] = shared_ptr<csvParser>(new crewParser);
	tableParserMap["CrewRank(COF)"] = shared_ptr<csvParser>(new crewRankParser);
	tableParserMap["CrewCompanyRank(COF)"] = shared_ptr<csvParser>(new crewCompanyRankParser);
	tableParserMap["CrewBase(COF)"] = shared_ptr<csvParser>(new crewBaseParser);
	tableParserMap["CrewFleet(COF)"] = shared_ptr<csvParser>(new crewFleetParser);
	tableParserMap["CrewQualification(COF)"] = shared_ptr<csvParser>(new crewQualificationParser);
	tableParserMap["CrewPreference(COF)"] = shared_ptr<csvParser>(new crewPreferenceParser); //mantis#2208, 补齐cof子数据parser
	tableParserMap["CrewStatus(COF)"] = shared_ptr<csvParser>(new crewStatusParser);
	tableParserMap["CrewTeam(COF)"] = shared_ptr<csvParser>(new crewTeamParser);
	tableParserMap["CrewEntitlement(COF)"] = shared_ptr<csvParser>(new crewEntitlementParser);//mantis#3316, 避免csv 数据段警告
	tableParserMap["CrewGuaranteeHour(COF)"] = shared_ptr<csvParser>(new crewGuaranteeHourParser);
	tableParserMap["CrewTeam"] = shared_ptr<csvParser>(new crewTeamParser);
	tableParserMap["CrewPreference"] = shared_ptr<csvParser>(new crewPreferenceParser);
	tableParserMap["CrewStatus"] = shared_ptr<csvParser>(new crewStatusParser);
	tableParserMap["CrewEntitlement"] = shared_ptr<csvParser>(new crewEntitlementParser);
    tableParserMap["CrewRequestDetail"] = shared_ptr<csvParser>(new crewRequestDetailParser);
    tableParserMap["CrewRequestRecord"] = shared_ptr<csvParser>(new crewRequestRecordParser);
    tableParserMap["CrewRequestRecordDetail"] = shared_ptr<csvParser>(new crewRequestRecordDetailParser);
	tableParserMap["CrewKpiAdjust"] = shared_ptr<csvParser>(new crewKpiAdjustParser);
	tableParserMap["CrewRpRecency"] = shared_ptr<csvParser>(new crewRpRecencyParser);
	tableParserMap["CrewSeniority"] = shared_ptr<csvParser>(new crewSeniorityParser);

	tableParserMap["Roster"] = shared_ptr<csvParser>(new rosterParser);
	tableParserMap["RosterGround"] = shared_ptr<csvParser>(new rosterGroundParser);
	tableParserMap["CrewMandayCcAm"] = shared_ptr<csvParser>(new mandayCcAmParser);
	tableParserMap["CrewMandayFd"] = shared_ptr<csvParser>(new mandayFdParser);

	tableParserMap["PublishedCrewMandayCcAm"] = shared_ptr<csvParser>(new mandayCcAmParser);
	tableParserMap["PublishedCrewMandayFd"] = shared_ptr<csvParser>(new mandayFdParser);

	tableParserMap["Assignment"] = shared_ptr<csvParser>(new assignmentParser);
	tableParserMap["AssignmentGroup"] = shared_ptr<csvParser>(new assignmentGroupParser);
	tableParserMap["AssignmentGroupMap"] = shared_ptr<csvParser>(new assignmentGroupMapParser);
	tableParserMap["AssignmentOverlappable"] = shared_ptr<csvParser>(new assignmentOverlappableParser);

	tableParserMap["Attribute"] = shared_ptr<csvParser>(new attributeParser);
	tableParserMap["Airport"] = shared_ptr<csvParser>(new airportParser);
	tableParserMap["City"] = shared_ptr<csvParser>(new cityParser);
	tableParserMap["Briefing"] = shared_ptr<csvParser>(new briefingParser);
	
	tableParserMap["RankActing"] = shared_ptr<csvParser>(new rankActingParser);
	tableParserMap["PortQualReqmnt"] = shared_ptr<csvParser>(new portQualReqmntParser);

	tableParserMap["CrewOnFlight"] = shared_ptr<csvParser>(new crewOnFlightParser);
	tableParserMap["Holiday"] = shared_ptr<csvParser>(new holidayParser);
	tableParserMap["SystemParameter"] = shared_ptr<csvParser>(new sysParamParser);

	tableParserMap["Recency"] = shared_ptr<csvParser>(new recencyParser);
	tableParserMap["RecencyRules"] = shared_ptr<csvParser>(new recencyRulesParser);
	tableParserMap["FleetRecency"] = shared_ptr<csvParser>(new fleetRecencyParser);
	tableParserMap["PortRecency"] = shared_ptr<csvParser>(new portRecencyParser);

	tableParserMap["Scenario"] = shared_ptr<csvParser>(new scenarioParser);
	tableParserMap["ScenarioKpi"] = shared_ptr<csvParser>(new scenarioKpiParser);
	tableParserMap["Workset"] = shared_ptr<csvParser>(new worksetParser);
	tableParserMap["Scenario(LEADIN)"] = shared_ptr<csvParser>(new scenarioParser);

	tableParserMap["CrewId"] = shared_ptr<csvParser>(new stringParser);
	tableParserMap["Aircraft"] = shared_ptr<csvParser>(new aircraftParser);
	tableParserMap["Flight(COMMUTE)"] = shared_ptr<csvParser>(new flightParser);
	tableParserMap["FlightComposition(COMMUTE)"] = shared_ptr<csvParser>(new flightCompositionParser);
	tableParserMap["CommuteSchedule"] = shared_ptr<csvParser>(new commuteScheduleParser);
	tableParserMap["imbalanceFlightParser"] = shared_ptr<csvParser>(new imbalanceFlightParser);
	tableParserMap["OptimizationNecessity"] = shared_ptr<csvParser>(new optimizationNecessityParser);

	//20180515 ain, mantis#
	tableParserMap["CrewProfile"] = shared_ptr<csvParser>(new crewProfileParser);
	tableParserMap["CrewProfile(COF)"] = shared_ptr<csvParser>(new crewProfileParser);

	tableParserMap["RouteActualRest"] = shared_ptr<csvParser>(new routeActualRestParser);
	tableParserMap["Route"] = shared_ptr<csvParser>(new routeParser);
	tableParserMap["RankCombinationCriteria"] = shared_ptr<csvParser>(new rankCombinationCriteriaParser);
	tableParserMap["RankCombination"] = shared_ptr<csvParser>(new rankCombinationParser);

	tableParserMap["CalculationManday"] = shared_ptr<csvParser>(new calculationMandayParser);
	tableParserMap["Venue"] = shared_ptr<csvParser>(new defaultParser);
	tableParserMap["Training"] = shared_ptr<csvParser>(new defaultParser);
	tableParserMap["TrainingVenue"] = shared_ptr<csvParser>(new defaultParser);
	tableParserMap["TrainingRoster"] = shared_ptr<csvParser>(new defaultParser);
	tableParserMap["PaneHeader"] = shared_ptr<csvParser>(new defaultParser); 
	tableParserMap["Default"] = shared_ptr<csvParser>(new defaultParser);
	tableParserMap["EvaCrDefaultDutyTime"] = shared_ptr<csvParser>(new csvEvaCrDefaultDutyTimeParser);
	
	tableParserMap["Voyage"] = shared_ptr<csvParser>(new voyageParser);
	tableParserMap["VoyageDetail"] = shared_ptr<csvParser>(new voyageDetailParser);

	tableParserMap["Teaching"] = shared_ptr<csvParser>(new teachingParser);
	tableParserMap["TeachingDetail"] = shared_ptr<csvParser>(new teachingDetailParser);
	tableParserMap["TeachingHistoryDetailForCACC"] = shared_ptr<csvParser>(new teachingHistoryDetailForCACCParser);

	tableParserMap["TmTrainingConfig"] = shared_ptr<csvParser>(new tmTrainingConfigParser);

	tableParserMap["TmCourse"] = shared_ptr<csvParser>(new tmCourseParser);
	tableParserMap["TmCourseBrief"] = shared_ptr<csvParser>(new tmCourseBriefParser);
	tableParserMap["TmCourseDuration"] = shared_ptr<csvParser>(new tmCourseDurationParser);
	tableParserMap["TmCourseRole"] = shared_ptr<csvParser>(new tmCourseRoleParser);
	tableParserMap["TmCourseRoleBase"] = shared_ptr<csvParser>(new tmCourseRoleBaseParser);
	tableParserMap["TmCourseRoleQual"] = shared_ptr<csvParser>(new tmCourseRoleQualParser);
	tableParserMap["TmCourseRoleDevice"] = shared_ptr<csvParser>(new tmCourseRoleDeviceParser);

	tableParserMap["TmFootprint"] = shared_ptr<csvParser>(new tmFootprintParser);
	tableParserMap["TmFootprintCourse"] = shared_ptr<csvParser>(new tmFootprintCourseParser);
	tableParserMap["TmFootprintCourseTrainee"] = shared_ptr<csvParser>(new tmFootprintCourseTraineeParser);
	tableParserMap["TmFootprintCourseSector"] = shared_ptr<csvParser>(new tmFootprintCourseSectorParser);
	tableParserMap["TmFootprintCourseIpRole"] = shared_ptr<csvParser>(new tmFootprintCourseIpRoleParser);
	tableParserMap["TmFootprintCourseIpRoleBase"] = shared_ptr<csvParser>(new tmFootprintCourseIpRoleBaseParser);
	tableParserMap["TmFootprintCourseIpRoleQual"] = shared_ptr<csvParser>(new tmFootprintCourseIpRoleQualParser);
	tableParserMap["TmFootprintCourseRole"] = shared_ptr<csvParser>(new tmFootprintCourseRoleParser);
	tableParserMap["TmFootprintCourseRoleQual"] = shared_ptr<csvParser>(new tmFootprintCourseRoleQualParser);
	tableParserMap["TmFootprintCourseRoleLimitation"] = shared_ptr<csvParser>(new tmFootprintCourseRoleLimitationParser);

	tableParserMap["TmProgram"] = shared_ptr<csvParser>(new tmProgramParser);
	tableParserMap["TmProgramBuddy"] = shared_ptr<csvParser>(new tmProgramBuddyParser);
	tableParserMap["TmProgramBuddyTime"] = shared_ptr<csvParser>(new tmProgramBuddyTimeParser);
	tableParserMap["TmProgramBuddyCourse"] = shared_ptr<csvParser>(new tmProgramBuddyCourseParser);
	tableParserMap["TmProgramPip"] = shared_ptr<csvParser>(new tmProgramPipParser);

	tableParserMap["TmProgramCourse"] = shared_ptr<csvParser>(new tmProgramCourseParser);
	tableParserMap["TmProgramCourseInstructor"] = shared_ptr<csvParser>(new tmProgramCourseInstructorParser);
	tableParserMap["TmProgramCourseLimitation"] = shared_ptr<csvParser>(new tmProgramCourseLimitationParser);
	tableParserMap["TmProgramCourseIpRelevance"] = shared_ptr<csvParser>(new tmProgramCourseIpRelevanceParser);
	tableParserMap["TmProgramCourseRole"] = shared_ptr<csvParser>(new tmProgramCourseRoleParser);
	tableParserMap["TmProgramCourseRoleQual"] = shared_ptr<csvParser>(new tmProgramCourseRoleQualParser);
	tableParserMap["TmProgramCourseRoleLimitation"] = shared_ptr<csvParser>(new tmProgramCourseRoleLimitationParser);
	tableParserMap["TmProgramCoursePnr"] = shared_ptr<csvParser>(new tmProgramCoursePnrParser);
	tableParserMap["TmProgramCourseIpck"] = shared_ptr<csvParser>(new tmProgramCourseIpckParser);
	tableParserMap["TmProgramCourseMore"] = shared_ptr<csvParser>(new tmProgramCourseMoreParser);
	tableParserMap["TmProgramCourseMoreLeg"] = shared_ptr<csvParser>(new tmProgramCourseMoreLegParser);

	tableParserMap["TmProgramCourseIpRole"] = shared_ptr<csvParser>(new tmProgramCourseIpRoleParser);
	tableParserMap["TmProgramCourseIpRoleBase"] = shared_ptr<csvParser>(new tmProgramCourseIpRoleBaseParser);
	tableParserMap["TmProgramCourseIpRoleQual"] = shared_ptr<csvParser>(new tmProgramCourseIpRoleQualParser);
	tableParserMap["TmProgramCourseIpRole"] = shared_ptr<csvParser>(new tmProgramCourseIpRoleParser);

	tableParserMap["TmDevice"] = shared_ptr<csvParser>(new tmDeviceParser);
	tableParserMap["TmDeviceTime"] = shared_ptr<csvParser>(new tmDeviceTimeParser);

	tableParserMap["TmPairingChart"] = shared_ptr<csvParser>(new tmPairingChartParser);
	tableParserMap["TmPairingChartRole"] = shared_ptr<csvParser>(new tmPairingChartRoleParser);
	tableParserMap["TmPairingChartRoleQual"] = shared_ptr<csvParser>(new tmPairingChartRoleQualParser);
	tableParserMap["TmPairingChartCourse"] = shared_ptr<csvParser>(new tmPairingChartCourseParser);

	tableParserMap["RosterFlight"] = shared_ptr<csvParser>(new rosterFlightParser);
	tableParserMap["PairingDutyNode"] = shared_ptr<csvParser>(new pairingDutyNodeParser);

	tableParserMap["CrewFlyTogether"] = shared_ptr<csvParser>(new crewFlyTogetherParser);
	tableParserMap["CrewFlyPreference"] = shared_ptr<csvParser>(new crewFlyPreferenceParser);

	tableParserMap["TagCategory"] = shared_ptr<csvParser>(new tagCategoryParser);
	tableParserMap["TagGroup"] = shared_ptr<csvParser>(new tagGroupParser);
	tableParserMap["TagFlight"] = shared_ptr<csvParser>(new tagFlightParser);
	tableParserMap["TagFlightComposition"] = shared_ptr<csvParser>(new tagFlightCompositionParser);
	tableParserMap["TagDuty"] = shared_ptr<csvParser>(new tagDutyParser);
	tableParserMap["TagPairing"] = shared_ptr<csvParser>(new tagPairingParser);
	tableParserMap["TagRosterGround"] = shared_ptr<csvParser>(new tagRosterGroundParser);
	tableParserMap["TagSuperCategory"] = shared_ptr<csvParser>(new tagSuperCategoryParser);
	tableParserMap["TagSuperCategoryMap"] = shared_ptr<csvParser>(new tagSuperCategoryMapParser);
	tableParserMap["DepartmentGroup"] = shared_ptr<csvParser>(new departmentGroupParser);
	tableParserMap["HistoryCrewStatistics"] = shared_ptr<csvParser>(new historyCrewStatisticsParser);
	tableParserMap["HistoryDepartmentStatistics"] = shared_ptr<csvParser>(new historyDepartmentStatisticsParser);
	tableParserMap["CrewMonthManday"] = shared_ptr<csvParser>(new crewMonthMandayParser);
	tableParserMap["PortLoStatistics"] = shared_ptr<csvParser>(new portLOStatisticsParser);
	tableParserMap["RosterPeriod"] = shared_ptr<csvParser>(new rosterPeriodParser);
	tableParserMap["GuaranteeFlyHours"] = shared_ptr<csvParser>(new guaranteeFlyHoursParser);
	tableParserMap["QualExtensionConfig"] = shared_ptr<csvParser>(new qualExtensionConfigParser);
    // bidding相关数据表
    tableParserMap["Bid"] = shared_ptr<csvParser>(new bidParser);
    tableParserMap["BidRequirement"] = shared_ptr<csvParser>(new bidRequirementParser);
    tableParserMap["BidRequirementDetail"] = shared_ptr<csvParser>(new bidRequirementDetailParser);
    tableParserMap["BiddingSequence"] = shared_ptr<csvParser>(new biddingSequenceParser);
    tableParserMap["BiddingSequenceGroup"] = shared_ptr<csvParser>(new biddingSequenceGroupParser);
    tableParserMap["BiddingResult"] = shared_ptr<csvParser>(new biddingResultParser);
    tableParserMap["BiddingResultDetail"] = shared_ptr<csvParser>(new biddingResultDetailParser);
	tableParserMap["SubFleet"] = shared_ptr<csvParser>(new subFleetParser);
	tableParserMap["FatigueResult"] = shared_ptr<csvParser>(new fatigueResultParser);
	tableParserMap["RouteRadiationConfig"] = shared_ptr<csvParser>(new routeRaditionConfigParser);
	// TO相关数据表
	tableParserMap["PairingChangeRecord"] = shared_ptr<csvParser>(new pairingChangeRecordParser);
	tableParserMap["ProgramCourseParticipant"] = shared_ptr<csvParser>(new programCourseParticipantParser);
	tableParserMap["ProgramCourseInstructorParticipant"] = shared_ptr<csvParser>(new programCourseInstructorParticipantParser);

	tableParserMap["DutyCodeLogic"] = shared_ptr<csvParser>(new dutyCodeLogicParser);
	tableParserMap["DutyCodeTypeComp"] = shared_ptr<csvParser>(new dutyCodeTypeCompParser);
	tableParserMap["CrewFirstDutyInfo"] = shared_ptr<csvParser>(new crewFirstDutyInfoParser);
}

string crewCsvReader::getParserName(string tableName) {
	string foundName = "";
	map<string, shared_ptr<csvParser>>::iterator it;
	for (it = tableParserMap.begin(); it != tableParserMap.end(); it++) {
		string tmpName = it->first;
		if (tableName == tmpName) {
			foundName = tmpName;
			break;
		}
		std::size_t index = tableName.find("." + tmpName);
		if (index != string::npos && index == tableName.length() - tmpName.length() - 1) {
			foundName = tmpName;
			break;
		}
	}
	if (foundName == "")
		return tableName;
	return foundName;
}
int crewCsvReader::getVersion()
{
	return version;
}
//按以下规则匹配 tableName
//1) 完全一致，如 CrewRank
//2) .tableName结尾，如 com.pisolution.data.CrewRank
shared_ptr<csvParser> crewCsvReader::getParser(string tableName) {
	string foundName = getParserName(tableName);
	if (foundName == "" || tableParserMap.find(foundName) == tableParserMap.end())
		return tableParserMap["Default"];
	return tableParserMap[foundName];
}


void defaultParser::init(vector<string>& headers) {}

string defaultParser::toCsv(vector<string>& headers, void* obj) {
	return "";
}
void defaultParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {

}
void* defaultParser::createInstance() {
	return NULL;
}
void defaultParser::deleteInstance(void* obj) {

}
static vector<string> defaultParserHeaders;
vector<string>& defaultParser::getDefaultHeaders() {
	return defaultParserHeaders;
}
