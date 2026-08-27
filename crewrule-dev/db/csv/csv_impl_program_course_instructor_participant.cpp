/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2026/1/13 11:00
 * @File:    csv_impl_program_course_instructor_participant.cpp
 * @Version: 1.0.0
 * @Copyright (c) 2026 Pi-solution. All rights reserved.
**/
#include <sstream>
#include "DBTrainingProgramCourseInstructorParticipant.h"
#include "csv_impl.h"

void programCourseInstructorParticipantParser::init(vector<string> &headers) {}


static vector<string> rankDefaultHeaders = {"programCourseId", "sector", "role", "crewId", "rosterId", "rosterGroundId",
                                            "scenarioId"};
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

vector<string> &programCourseInstructorParticipantParser::getDefaultHeaders() {
    return rankDefaultHeaders;
}

void *programCourseInstructorParticipantParser::createInstance() {
    return new DBTrainingProgramCourseInstructorParticipant();
}

void programCourseInstructorParticipantParser::deleteInstance(void *obj) {
    delete (DBTrainingProgramCourseInstructorParticipant *) obj;
}

string programCourseInstructorParticipantParser::toCsv(vector<string> &headers, void *obj) {
    stringstream ss;
    DBTrainingProgramCourseInstructorParticipant *ref = (DBTrainingProgramCourseInstructorParticipant *) obj;
    for (std::size_t i = 0; i < headers.size(); i++) {
        if (headers[i] == "programCourseId") { ss << ref->GetProgramCourseInstructorId() << "^"; }
        else if (headers[i] == "role") {
            auto roleIt = roleTypeMap.find(ref->GetRole());
            if (roleIt != roleTypeMap.end())
                ss << roleIt->second << "^";
        } else if (headers[i] == "crewId") { ss << ref->GetCrewId() << "^"; }
        else if (headers[i] == "rosterId") { ss << ref->GetRosterId() << "^"; }
        else if (headers[i] == "rosterGroundId") { ss << ref->GetRosterGroundId() << "^"; }
        else if (headers[i] == "scenarioId") { ss << ref->GetScenarioId() << "^"; }
        else { logUnkonwnField("DBTrainingPairingChangeRecord", headers[i]); }
    }
    return ss.str();
}

void programCourseInstructorParticipantParser::fromCsv(vector<string> &headers, int index, char *value, void *obj) {
    DBTrainingProgramCourseInstructorParticipant *ref = (DBTrainingProgramCourseInstructorParticipant *) obj;
    if (headers[index] == "programCourseId") { ref->SetProgramCourseInstructorId(atoll(value)); }
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
