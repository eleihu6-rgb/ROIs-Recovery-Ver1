//
// Created by haoli on 2025/7/3.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGCOURSEROLEREQUIREMENT_H
#define TRAININGOPTIMIZER_DBTRAININGCOURSEROLEREQUIREMENT_H

#include "vector"
#include "string"
#include "unordered_set"

class DBTrainingCourseRoleRequirement {
public:
    enum class RoleType {
        Trainee,
        Instructor,
        Checker,
        Partner,
        SafetyPilot,
        ExtraInstructor,
        Standardization,
        ObserveIP,
        ProbationIP,
        ObserveTrainee
    };

    struct RoleRequirement {
        RoleRequirement(const std::pair<std::unordered_set<std::string>, bool> &bases,
                        const std::pair<std::unordered_set<std::string>, bool> &ranks,
                        const std::pair<std::unordered_set<std::string>, bool> &fleets,
                        const std::pair<std::unordered_set<std::string>, bool> &teams,
                        const std::pair<std::unordered_set<std::string>, bool> &qualifications,
                        const std::unordered_set<std::string> &actingRanks, unsigned int limitation, bool operating) :
                basesPair(bases), ranksPair(ranks), fleetsPair(fleets), teamsPair(teams),
                qualificationsPair(qualifications), actingRanks(actingRanks), limitation(limitation), operating(operating) {}
        std::pair<std::unordered_set<std::string>, bool> basesPair;
        std::pair<std::unordered_set<std::string>, bool> ranksPair;
        std::pair<std::unordered_set<std::string>, bool> fleetsPair;
        std::pair<std::unordered_set<std::string>, bool> teamsPair;
        std::pair<std::unordered_set<std::string>, bool> qualificationsPair;
        std::unordered_set<std::string> actingRanks;
        unsigned int limitation{0};
        bool operating{true};
    };

    DBTrainingCourseRoleRequirement(long long courseId, RoleType roleType, std::vector<RoleRequirement> &&roleRequirements,
                                    bool countForOperating, unsigned int lowerRange, unsigned int upperRange) : _courseId(courseId), _roleType(roleType),
                                    _roleRequirements(std::move(roleRequirements)), _countForOperating(countForOperating), _lowerRange(lowerRange), _upperRange(upperRange) {}

    const long long GetCourseId() const { return _courseId; }

    void SetCourseId(long long courseId) { _courseId = courseId; }

    const RoleType GetRoleType() const { return _roleType; }

    void SetRoleType(RoleType type) { _roleType = type; }

    const bool GetCountForOperating() const { return _countForOperating; }

    void SetCountForOperating(bool op) { _countForOperating = op; }

    const std::vector<RoleRequirement> &GetRoleRequirements() const { return _roleRequirements; }

    void SetRoleRequirements(std::vector<RoleRequirement> &&roleRequirements){_roleRequirements = std::move(roleRequirements);}

    const unsigned int GetLowerRange() const { return _lowerRange; }

    void SetLowerRange(unsigned int lowerRange) { _lowerRange = lowerRange; }

    const unsigned int GetUpperRange() const { return _upperRange; }

    void SetUpperRange(unsigned int upperRange) { _upperRange = upperRange; }

private:
    long long _courseId;
    RoleType _roleType;
    std::vector<RoleRequirement> _roleRequirements;
    bool _countForOperating{true};      //This setting will affect the composition change. If set to ‘Y’, actingRank must either be ‘*’ or an operating rank on a pairing
    unsigned int _lowerRange{0};
    unsigned int _upperRange{0};
};


#endif //TRAININGOPTIMIZER_DBTRAININGCOURSEROLEREQUIREMENT_H
