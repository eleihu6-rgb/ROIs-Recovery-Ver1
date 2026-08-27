//
// Created by haoli on 2026/4/16.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGCOURSEROLEBASE_H
#define TRAININGOPTIMIZER_DBTRAININGCOURSEROLEBASE_H

#include "DBTrainingCourseRoleDevice.h"
#include "DBTrainingCourseRoleQual.h"

#include <memory>
#include <string>
#include <vector>

class DBTrainingCourseRoleBase {
public:
    DBTrainingCourseRoleBase(long long id, long long tmCourseRoleId, std::vector<std::string> bases,
                             std::vector<std::string> ranks, std::vector<std::string> fleets,
                             std::vector<std::string> teams, std::vector<std::string> actingRanks, bool operating,
                             std::vector<std::unique_ptr<DBTrainingCourseRoleQual>> &&quals,
                             std::unique_ptr<DBTrainingCourseRoleDevice> device)
            : _id(id), _tmCourseRoleId(tmCourseRoleId), _bases(std::move(bases)), _ranks(std::move(ranks)),
              _fleets(std::move(fleets)), _teams(std::move(teams)), _actingRanks(std::move(actingRanks)),
              _operating(operating), _quals(std::move(quals)), _device(std::move(device)) {}

    DBTrainingCourseRoleBase(const DBTrainingCourseRoleBase &) = delete;

    DBTrainingCourseRoleBase &operator=(const DBTrainingCourseRoleBase &) = delete;

    DBTrainingCourseRoleBase(DBTrainingCourseRoleBase &&) = delete;

    DBTrainingCourseRoleBase &operator=(DBTrainingCourseRoleBase &&) = delete;

    long long GetId() const { return _id; }

    void SetId(long long id) { _id = id; }

    long long GetTmCourseRoleId() const { return _tmCourseRoleId; }

    void SetTmCourseRoleId(long long tmCourseRoleId) { _tmCourseRoleId = tmCourseRoleId; }

    const std::vector<std::string> &GetBases() const { return _bases; }

    void SetBases(std::vector<std::string> bases) { _bases = std::move(bases); }

    const std::vector<std::string> &GetRanks() const { return _ranks; }

    void SetRanks(std::vector<std::string> ranks) { _ranks = std::move(ranks); }

    const std::vector<std::string> &GetFleets() const { return _fleets; }

    void SetFleets(std::vector<std::string> fleets) { _fleets = std::move(fleets); }

    const std::vector<std::string> &GetTeams() const { return _teams; }

    void SetTeams(std::vector<std::string> teams) { _teams = std::move(teams); }

    const std::vector<std::string> &GetActingRanks() const { return _actingRanks; }

    void SetActingRanks(std::vector<std::string> actingRanks) { _actingRanks = std::move(actingRanks); }

    bool GetOperating() const { return _operating; }

    void SetOperating(bool operating) { _operating = operating; }

    const std::vector<std::unique_ptr<DBTrainingCourseRoleQual>> &GetQuals() const { return _quals; }

    void SetQuals(std::vector<std::unique_ptr<DBTrainingCourseRoleQual>> &&quals) { _quals = std::move(quals); }

    DBTrainingCourseRoleDevice *GetDevice() const { return _device.get(); }

    void SetDevice(std::unique_ptr<DBTrainingCourseRoleDevice> device) { _device = std::move(device); }

private:
    long long _id{0};
    long long _tmCourseRoleId{0};
    std::vector<std::string> _bases;
    std::vector<std::string> _ranks;
    std::vector<std::string> _fleets;
    std::vector<std::string> _teams;
    std::vector<std::string> _actingRanks;
    bool _operating{true};
    std::vector<std::unique_ptr<DBTrainingCourseRoleQual>> _quals;
    std::unique_ptr<DBTrainingCourseRoleDevice> _device;
};

#endif // TRAININGOPTIMIZER_DBTRAININGCOURSEROLEBASE_H
