/*
说明：
封装 csv file read/write逻辑，如读/写 pairing段、manday段等
*/

#ifndef CSV_FILE_STREAM_UTIL_H
#define CSV_FILE_STREAM_UTIL_H
#include <iostream>
#include <map>
#include "csv/csv_impl.h"
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "Log/Logger.h"

void loadWorksetAndScenario(CrewDataContext* dbData, crewCsvReader& reader, map<long long, BASE>& baseObjMap, map<long long, RANK>& rankObjMap, map<long long, string>& fleetIdMap, map<long long, ATTRIBUTE*>& tmpAttrMap, map<long long, SharedPtr<TAG_CATEGORY>> tmpTagMap);

void loadFlightAndCompAndAttr(std::unordered_map<long long, SharedPtr<Segment>>& flightIdMap, vector<std::shared_ptr<Segment>>& flightList, crewCsvReader& reader, CrewDataContext* dbData);

void loadPairingDutySegment(unordered_map<long long, Pairing*>& pairingIdMap, unordered_map<long long, SharedPtr<Segment>>& flightIdMap, map<long long, shared_ptr<map<string, int>>>& compositionRankValueMap, crewCsvReader& reader, CrewDataContext* dbData);

void loadCompositionRank(map<long long, shared_ptr<map<string, int>>>& compositionRankValueMap, map<long long, string>& rankIdMap, crewCsvReader& reader, CrewDataContext* dbData);

void loadCompositionLoad(CrewDataContext* dbData, crewCsvReader& reader);

void loadAssignmentAndGroup(CrewDataContext* dbData, crewCsvReader& reader);
void loadRuleSet(CrewDataContext* dbData, crewCsvReader& reader);
void loadRule(CrewDataContext* dbData, crewCsvReader& reader);
void loadAllRule(CrewDataContext* dbData, crewCsvReader& reader);//法规服务化使用
void loadCqf(CrewDataContext* dbData, crewCsvReader& reader);

void loadPortQualReqmnt(CrewDataContext* dbData, crewCsvReader& reader);
void loadQualExtensionConfig(CrewDataContext* dbData, crewCsvReader& reader);

void loadCsvRoster(CrewDataContext* dbData, crewCsvReader& reader, string dataName);
void loadCsvRosterGround(CrewDataContext* dbData, crewCsvReader& reader, string dataName);

void makeIndexCrewIdPairingIdToRoster(CrewDataContext* dbData, map<string, map<long long, shared_ptr<ROSTER>>>& crewIdPairingIdToRoster);

void saveMandayToCsvStream(std::ofstream &outfile, time_t startDtLoc, time_t endDtLoc, crewCsvReader& reader, CrewDataContext* dbData);
void saveGroundRosterToCsvStream(ofstream& outfile, time_t startDtLoc, time_t endDtLoc, const unordered_map<long long, std::shared_ptr<ROSTER>>& orgRosterMap, CrewDataContext* dbData);
void saveRosterFlightToCsvStream(ofstream &outfile, time_t startDtLoc, time_t endDtLoc, vector<long long>& flightIds, crewCsvReader& reader, CrewDataContext* dbData);

void savePairingDutySegmentToCsv(ofstream &outfile, vector<Pairing*>& pairingCopies, crewCsvReader& reader, CrewDataContext* dbData);
void savePairingDutySegmentToCsvForTO(ofstream &outfile, vector<Pairing*>& pairingCopies, crewCsvReader& reader, CrewDataContext* dbData);

void saveRosterToCsv(ofstream &outfile, crewCsvReader& reader, CrewDataContext* dbData, bool isSaveNewRoster = true);

void saveRosterGroundTagToCsv(ofstream& outfile, crewCsvReader& reader, CrewDataContext* dbData);

void saveBiddingResultsToCsv(ofstream &outfile, crewCsvReader& reader, CrewDataContext* dbData);

void copyFlightFieldToSegment(Segment* flt, Segment* seg);
void fillSegmentDateField(Segment* seg);
void fillSegmentLocTimeField(Segment* seg, map<string, DBAirport*>& airportCodeMap, CrewDataContext* dbData);
void fillPairingAndDutyField(Pairing * pairing, map<string, DBAirport*>& airportCodeMap);
int makeSegmentByCommuteSchedule(csvCommuteSchedule * commute, string& airline, time_t startUtc, time_t endUtc, long long startOfBusId, unordered_map<string, int> &airportUtcOffsetMap, unordered_map<string, daylight_saving> &daylightSavingMap, vector<Segment*>& result);

//rule utils
DBRule makeMixRuleByCsv(DBRule* originObj, long long ruleSet, csvRuleParam * item);
DBRule makeTableRuleByCsv(map<string, vector<string>>& ruleIdHeaderMap, DBRule* originObj, long long ruleSet, csvRuleParam * item);
void getTableNumFromNameStr(const char * names, char * buf, int bufsize);
void getRowNumFromNameStr(const char * names, char * buf, int bufsize);
void saveCsvRuleParameter(crewCsvReader& reader, ofstream& outfile, string name, vector<DBRule>& list);

#define cleanupList(list) for (auto& ptr : list) {\
		delete ptr;\
				}\
	list.clear();
#define CLEANUP_CSV_LIST(csvList) for (void * ptr : csvList) {\
		delete ptr;\
		}\
	csvList.clear();

#define ClearCsvReaderData(type, list) \
	for (size_t k = 0; k < list.size(); k++) { \
		type* r = (type*)list[k]; \
		delete r; list[k] = NULL; \
				} \
	list.clear();

#define CATCH_EXCEPTIONS(funcName) \
	catch (string& e) {\
		Logger::getRuleLogger()->error("Exception: {} fail, {} dbg={}", funcName, e, dbg);\
	}\
	catch (int e) {\
		Logger::getRuleLogger()->error("Exception: {} fail, {} dbg={}", funcName, e, dbg);\
	}\
	catch (std::invalid_argument& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, invalid_argument={} dbg={}", funcName, ex.what(), dbg);\
	}\
	catch (std::domain_error& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, domain_error={} dbg={}", funcName, ex.what(), dbg);\
	}\
	catch (std::length_error& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, length_error={} dbg={}", funcName, ex.what(), dbg);\
	}\
	catch (std::out_of_range& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, out_of_range={} dbg={}", funcName, ex.what(), dbg);\
	}\
	catch (std::overflow_error& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, overflow_error={} dbg={}", funcName, ex.what(), dbg);\
	}\
	catch (std::range_error& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, range_error={} dbg={}", funcName, ex.what(), dbg);\
	}\
	catch (std::ios_base::failure& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, ios_base::failure={} dbg={}", funcName, ex.what(), dbg);\
	}\
	catch (std::system_error& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, system_error={} dbg={}", funcName, ex.what(), dbg);\
	}\
	catch (std::underflow_error& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, underflow_error={} dbg={}", funcName, ex.what(), dbg);\
	}\
	catch (std::bad_array_new_length& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, bad_array_new_length={} dbg={}", funcName, ex.what(), dbg);\
	}\
	catch (std::bad_alloc& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, bad_alloc={} dbg={}", funcName, ex.what(), dbg); \
		Logger::getRuleLogger()->error("Exception: {} fail, current mem: {} MB, peak mem: {} dbg={}",funcName, (getProcessCurrentMem() / (1024 * 1024)), (getProcessPeakMem() / (1024 * 1024)), dbg); \
	}\
	catch (std::bad_cast& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, bad_cast={} dbg={}", funcName, ex.what(), dbg); \
	}\
	catch (std::bad_exception& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, bad_exception={} dbg={}", funcName, ex.what(), dbg); \
	}\
	catch (std::bad_typeid& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, bad_typeid={} dbg={}", funcName, ex.what(), dbg); \
	}\
	catch (std::bad_weak_ptr& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, bad_weak_ptr={} dbg={}", funcName, ex.what(), dbg); \
	}\
	catch (std::logic_error& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, logic_error={} dbg={}", funcName, ex.what(), dbg); \
	}\
	catch (std::runtime_error& ex) {\
		Logger::getRuleLogger()->error("Exception: {} fail, runtime_error={} dbg={}", funcName, ex.what(), dbg); \
	}\
	catch (exception& ex) {\
		Logger::getRuleLogger()->error("ERROR: saveRoCsv failed {}, dbg={} i={} dbg={}",ex.what(), dbg, funcName, i, dbg); \
	}
#endif//CSV_FILE_STREAM_UTIL_H