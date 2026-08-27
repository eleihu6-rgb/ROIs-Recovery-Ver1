#ifndef TEST_DB_FUNC_H
#define TEST_DB_FUNC_H

#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "Pairing.h"

#define log_mem(msg) \
{\
	long long current_mem = getProcessCurrentMem(); \
	printf("CURRENT memory size: (%.2f MB)  (pair=%d) (duty=%d) (seg=%d) (nodes=%d) (PO msg='%s'\n",\
		current_mem / (1024 * 1024.0), \
		Pairing::count(), Duty::count(), Segment::count(), Nodes::count(), \
		msg\
	);\
}

unsigned long long getProcessPeakMem();
unsigned long long getProcessCurrentMem();
void printMemInfo(const char * msg);
void printMemInfo(stringstream& ss, const char * msg);
void printMemInfoIncrement(const char * msg, long long increment);

//void          test_pairing_composition(PairingDBContext &ctx) ;
//Scenario      test_get_scenario(PairingDBContext &ctx, long long scenarioId);
//void          test_get_flight(PairingDBContext &ctx);
//void          test_get_rule_cqf(PairingDBContext &ctx, Scenario scenario);
//void          test_save_pairing(PairingDBContext &ctx);
//void          test_get_crew_qualification(PairingDBContext &ctx);
//void          test_get_crew(PairingDBContext &ctx);
//void          test_get_crew_fleet(PairingDBContext &ctx);
//void          test_get_crew_base(PairingDBContext &ctx);
//void          test_get_pairing(PairingDBContext &ctx);
void          test_file_pairing(vector<Pairing*> &pairingList, char* filename);
void          test_file_pairing2(vector<Pairing*> &pairingList, char* filename);
void          test_file_roster(vector<SharedPtr<ROSTER>> &rosterList, char * filename);
//void          test_file_duty(Duty* dutyList, int dutyCount, char* filename);
void          test_file_duty(vector<Duty*>& dutyList, char* filename);

void          test_file_pairing_duty_seg(Segment * buf, int count, char* filename);
void          test_file_segment(Segment* segList, int segCount, char* filename);
void          test_file_flight(vector<Segment>  &list, char * filepath);
void          test_file_flight_distribute(vector<Segment>  &list, char * filepath);
void          test_file_flight(vector<Segment*> &list, char * filepath);
void          test_file_flight(vector<shared_ptr<Segment>> &list, char * filepath);

void          test_file_airport(std::vector<DBAirport> &list, char* filename);
void          test_file_airport_timezone(unordered_map<string, int> &map);
//void          test_composition_covered(PairingDBContext &ctx, long long scenarioId, time_t startUtc, time_t endUtc);
void          test_add_del_clean(CrewDataContext &dbData);
void          test_file_port_dual_reqmnt(vector<DBPortQualReqmnts> &list);
void          test_file_port_dual_reqmnt_map(map<string, vector<DBPortQualReqmnts>> &m);
void          test_file_resource_ctrl(map<long long, map<string, int>>& resMap, const char* filepath);
void          test_file_rank_acting(vector<DBRankActing> &list, const char* filepath);

void          test_file_crew_rank(vector<SharedPtr<CREW_RANK>> &list, const char* filepath);
void          test_file_crew_base(vector<SharedPtr<CREW_BASE>> &list, const char* filepath);
void          test_file_crew_fleet(vector<SharedPtr<CREW_FLEET>> &list, const char* filepath);
void          test_file_crew_qual(vector<SharedPtr<CREW_QUALIFICATION>> &list, const char* filepath);
void          test_file_crew_roster(vector<SharedPtr< CREW>>& crewList, char * filepath);
void          test_file_manday_cc(vector<SharedPtr<CREW_MANDAY_CC_AM>>& list, char * filepath);
void          test_file_manday_fd(vector<SharedPtr<CREW_MANDAY_FD>>& list, char * filepath);
void          test_file_crew_recency(RecencyMgr& recencyMgr, char * filepath);
void          test_file_map(map<string, string>& m, char * filepath);
void          test_file_map2(map<string, bool>& m, char * filepath);
void          test_file_multimap(multimap<string, string>& m, char * filepath);
void          test_file_assignment_grp_val(unordered_map<string, unordered_set<string>>& m, char * filepath);
void          test_file_manday(vector<SharedPtr<CREW>>& list, char * filepath, bool isPublishManday);
void          test_file_assignment(map<long long, SharedPtr<ASSIGNMENT>>& totalAssign, char * filepath);

//void          test_file_resource_ctrl_base_blh(vector<ResourceCtrlBaseBlh>& list, const char*filepath);
//void          test_get_ferry(PairingDBContext &ctx);
void          test_file_cross_rank_rule(vector<SharedPtr<DBRule_CrossRank>> &list, const char * filepath);
void          test_file_rule_8014(vector<SharedPtr<DBRule_8014>> &list, const char * filepath);

void          test_file_crew_team(map<string, vector<SharedPtr<CREW_TEAM>>>& m, char* filepath);
//void test_file_scenario (Scenario &scenario);
void test_file_holiday    (vector<SharedPtr<Holiday>>& list, char* filepath);
void test_file_rule       (vector<DBRule> &ruleList, char * filepath);
void test_file_cqf        (vector<DBCqf> &cqfList, char * filepath);
void test_print_crew      (vector<SharedPtr<CREW>> &crewList, FILE * fp);
void test_file_crew       (vector<SharedPtr<CREW>> &crewList, char * filepath);
void test_file_crew_id_map(map<string, SharedPtr<CREW>>& idMap, char* filepath);
void test_file_leadin_info(vector<string>& list, const char* filepath);
void test_file_leadin_occupy(map<string, map<string, double>>& leadinOccupy, const char * filepath);
void test_utc();
void test_file_crew_on_flight(unordered_map<long long, vector<CREW*>>& cofMap, const char *filepath);
void test_file_crew_on_flight2(unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& cofMap, const char *filepath);
void test_file_crew_on_pairing(map<long long, list<SharedPtr<CrewOnFlight>>>& cofMap, const char *filepath);

void test_file_resource_ctrl_base_blh(vector<ResourceCtrlBaseBlh>& list, const char*filepath);


void log_warning(const char * logfile, const char * msg);


void test_crew_add_del_clean(CrewDataContext &dbData);
void complementToStr(const map<string, int> &complement, char * strbuf, int bufsize);

void log(char * msg);


void test_file_rule_po(vector<DBRule> &ruleList, char * filepath);
void test_file_cqf_po(vector<DBCqf> &cqfList, char * filepath);

void test_log_pairing(string msg, Pairing* p);
////按时间顺序打印 dutynode和 seg
void test_log_segs_and_nodes(string msg, Pairing* p);
//按时间段打印，若min/max=0表示不限制
void test_log_roster(string msg, vector<shared_ptr<ROSTER>>& list, time_t minStartUtc, time_t maxStartUtc);
void checkSeqOrderDuplicate(SharedPtr<CrewDataContext>& dbData);


void test_helper(CrewDataContext* dbData, string msg);
#endif//TEST_DB_FUNC_H