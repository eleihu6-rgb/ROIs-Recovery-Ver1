/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/11/20 11:22
 * @File:    csv_impl_program_course_participant.cpp
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/


#include <sstream>
#include "DBTrainingProgramCourseParticipant.h"
#include "csv_impl.h"

void programCourseParticipantParser::init(vector<string> &headers) {}


static vector<string> rankDefaultHeaders = {"programCourseId", "sector", "role", "crewId", "rosterId", "rosterGroundId",
                                            "scenarioId", "source"};
static std::unordered_map<DBTrainingCourseRoleRequirement::RoleType, std::string> roleTypeMap = {
    {DBTrainingCourseRoleRequirement::RoleType::Trainee, "TE"},
    {DBTrainingCourseRoleRequirement::RoleType::Instructor, "IP"},
    {DBTrainingCourseRoleRequirement::RoleType::Checker, "CK"},
    {DBTrainingCourseRoleRequirement::RoleType::Partner, "PNR"},
    {DBTrainingCourseRoleRequirement::RoleType::SafetyPilot, "SP"},
    {DBTrainingCourseRoleRequirement::RoleType::ExtraInstructor, "XIP"},
    {DBTrainingCourseRoleRequirement::RoleType::Standardization, "STD"},
    {DBTrainingCourseRoleRequirement::RoleType::ObserveIP, "OIP"},
    {DBTrainingCourseRoleRequirement::RoleType::ProbationIP, "PBN"},
    {DBTrainingCourseRoleRequirement::RoleType::ObserveTrainee, "TE_OBS"}
};
static std::unordered_map<std::string, DBTrainingCourseRoleRequirement::RoleType> roleStrMap{
        {"TE", DBTrainingCourseRoleRequirement::RoleType::Trainee},
        {"IP", DBTrainingCourseRoleRequirement::RoleType::Instructor},
        {"CK", DBTrainingCourseRoleRequirement::RoleType::Checker},
        {"PNR", DBTrainingCourseRoleRequirement::RoleType::Partner},
        {"SP", DBTrainingCourseRoleRequirement::RoleType::SafetyPilot},
        {"XIP", DBTrainingCourseRoleRequirement::RoleType::ExtraInstructor},
        {"STD", DBTrainingCourseRoleRequirement::RoleType::Standardization},
        {"OIP", DBTrainingCourseRoleRequirement::RoleType::ObserveIP},
        {"PBN", DBTrainingCourseRoleRequirement::RoleType::ProbationIP},
        {"TE_OBS", DBTrainingCourseRoleRequirement::RoleType::ObserveTrainee}
};

vector<string> &programCourseParticipantParser::getDefaultHeaders() {
    return rankDefaultHeaders;
}

void *programCourseParticipantParser::createInstance() {
    return new DBTrainingProgramCourseParticipant();
}

void programCourseParticipantParser::deleteInstance(void *obj) {
    delete (DBTrainingProgramCourseParticipant *) obj;
}

string programCourseParticipantParser::toCsv(vector<string> &headers, void *obj) {
    stringstream ss;
    DBTrainingProgramCourseParticipant *ref = (DBTrainingProgramCourseParticipant *) obj;
    for (std::size_t i = 0; i < headers.size(); i++) {
        if (headers[i] == "programCourseId") { ss << ref->GetProgramCourseId() << "^"; }
        else if (headers[i] == "sector") { ss << ref->GetSector() << "^"; }
        else if (headers[i] == "role") {
            auto roleIt = roleTypeMap.find(ref->GetRole());
            if (roleIt != roleTypeMap.end())
                ss << roleIt->second << "^";
        } else if (headers[i] == "crewId") { ss << ref->GetCrewId() << "^"; }
        else if (headers[i] == "rosterId") { ss << ref->GetRosterId() << "^"; }
        else if (headers[i] == "rosterGroundId") { ss << ref->GetRosterGroundId() << "^"; }
        else if (headers[i] == "scenarioId") { ss << ref->GetScenarioId() << "^"; }
        else if (headers[i] == "source") { ss << ref->GetScenarioId() << "^"; }
        else { logUnkonwnField("DBTrainingPairingChangeRecord", headers[i]); }
    }
    return ss.str();
}

void programCourseParticipantParser::fromCsv(vector<string> &headers, int index, char *value, void *obj) {
    DBTrainingProgramCourseParticipant *ref = (DBTrainingProgramCourseParticipant *) obj;
    if (headers[index] == "programCourseId") { ref->SetProgramCourseId(atoll(value)); }
    else if (headers[index] == "sector") { ref->SetSector(atoll(value)); }
    else if (headers[index] == "role") {
        auto roleIt = roleStrMap.find(value);
        if (roleIt != roleStrMap.end())
            ref->SetRole(roleIt->second);
    } else if (headers[index] == "crewId") { ref->SetCrewId(value); }
    else if (headers[index] == "rosterId") { ref->SetRosterId(atoll(value)); }
    else if (headers[index] == "rosterGroundId") { ref->SetRosterGroundId(atoll(value)); }
    else if (headers[index] == "scenarioId") { ref->SetScenarioId(atoll(value)); }
    else { logUnkonwnField("DBTrainingPairingChangeRecord", headers[index]); }
}
